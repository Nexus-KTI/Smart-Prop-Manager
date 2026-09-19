import type { Session } from "@supabase/supabase-js";

import {
  emitDataInvalidation,
  type DataInvalidationScope,
} from "@/lib/data-invalidation";
import { createClient } from "@/lib/supabase/client";
import { readPortfolioOwnerId } from "@/lib/portfolio";

import type {
  PortfolioPayment,
  PortfolioUnit,
  Property,
  Reminder,
  Transaction,
  Unit,
} from "./types";

function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8000"
  );
}

/** Same-origin proxy → API with NOTIFY_DIAG_SECRET (not exposed to browser). */
export async function checkSmsDelivery(phone: string): Promise<{
  found: boolean;
  status: string | null;
  error_code: number | null;
  error_message: string | null;
  hint: string | null;
  account_type: string | null;
}> {
  const res = await fetchWithTimeout(
    `/api/notify/sms-delivery?phone=${encodeURIComponent(phone)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error("Could not check SMS delivery status");
  }
  return res.json();
}

/** Single-flight refresh, concurrent refreshSession() races cause "Already Used". */
let refreshInFlight: Promise<Session | null> | null = null;
export const API_REQUEST_TIMEOUT_MS = 25_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) onAbort();
  else init.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error("Request timed out. Check your connection, then retry.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

function mutationInvalidations(
  path: string,
  method: string,
): DataInvalidationScope[] {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return [];
  const scopes = new Set<DataInvalidationScope>();
  if (
    path.startsWith("/properties/") ||
    /^\/payments\/(?:manual|paystack\/confirm|cards\/charge)$/.test(path) ||
    /^\/reminders\/(?:bulk|send|retry\/)/.test(path) ||
    /^\/tenancies\/[^/]+\/activate$/.test(path)
  ) {
    scopes.add("urgent-actions");
  }
  if (
    (method === "PATCH" && /^\/applications\/[^/]+$/.test(path)) ||
    /^\/applications\/token\/[^/]+\/submit$/.test(path)
  ) {
    scopes.add("applications");
  }
  if (
    /^\/maintenance\/(?:me|unit\/[^/]+)$/.test(path) ||
    /^\/maintenance\/[^/]+(?:\/complete)?$/.test(path)
  ) {
    scopes.add("work-orders");
  }
  if (/^\/messages\/threads\/[^/]+\/read$/.test(path)) {
    scopes.add("message-unread");
  }
  if (
    /^\/publications\/[^/]+\/read$/.test(path) ||
    (method === "PATCH" && /^\/tasks\/[^/]+$/.test(path))
  ) {
    scopes.add("notification-extras");
  }
  return [...scopes];
}

function sessionExpiringSoon(session: Session | null, skewMs = 60_000): boolean {
  if (!session?.access_token) return true;
  if (!session.expires_at) return false;
  return session.expires_at * 1000 <= Date.now() + skewMs;
}

async function resolveAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token && !sessionExpiringSoon(session)) {
    return session.access_token;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session?.access_token) {
          return data.session;
        }
        // Another tab/middleware may have won the refresh race, re-read storage.
        const {
          data: { session: latest },
        } = await supabase.auth.getSession();
        return latest;
      } catch {
        const {
          data: { session: latest },
        } = await supabase.auth.getSession();
        return latest;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  const refreshed = await refreshInFlight;
  return refreshed?.access_token ?? session?.access_token ?? null;
}

function buildHeaders(
  init: RequestInit,
  accessToken: string | null,
): Headers {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const portfolioOwnerId = readPortfolioOwnerId();
  if (portfolioOwnerId && !headers.has("X-Portfolio-Owner-Id")) {
    headers.set("X-Portfolio-Owner-Id", portfolioOwnerId);
  }
  return headers;
}

/** Client-side fetch wrapper: attaches Supabase session JWT to FastAPI calls. */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<Response> {
  const url = `${apiBaseUrl()}${path}`;
  const accessToken = await resolveAccessToken();
  const method = (init.method || "GET").toUpperCase();
  const requestHeaders = new Headers(init.headers);
  const requestInit = { ...init, headers: requestHeaders };

  const response = await fetchWithTimeout(url, {
    ...requestInit,
    headers: buildHeaders(requestInit, accessToken),
  });

  // Expired JWT that slipped past skew check, refresh once and retry.
  const retrySafe =
    method === "GET" ||
    method === "HEAD" ||
    requestHeaders.has("Idempotency-Key");
  if (response.status === 401 && !retried && retrySafe) {
    refreshInFlight = null;
    const refreshed = await resolveAccessToken();
    if (refreshed) {
      return apiFetch(path, requestInit, true);
    }
  }

  if (response.ok && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    emitDataInvalidation(mutationInvalidations(path, method), path);
  }

  return response;
}

export type CursorPage<T> = {
  items: T[];
  next_cursor: string | null;
};

function cursorQuery(cursor?: string | null, limit?: number): string {
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  if (limit != null) qs.set("limit", String(limit));
  const value = qs.toString();
  return value ? `?${value}` : "";
}

async function readCursorPage<T>(
  res: Response,
  fallback: string,
): Promise<CursorPage<T>> {
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, fallback));
  }
  const data = (await res.json()) as
    | T[]
    | { items?: T[]; next_cursor?: string | null };
  if (Array.isArray(data)) {
    return { items: data, next_cursor: null };
  }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchPropertiesPage(
  cursor?: string | null,
): Promise<CursorPage<Property>> {
  const res = await apiFetch(`/properties/${cursorQuery(cursor)}`);
  return readCursorPage<Property>(res, "Failed to load properties");
}

export async function fetchPortfolioUnitsPage(
  cursor?: string | null,
): Promise<CursorPage<PortfolioUnit>> {
  const res = await apiFetch(
    `/properties/portfolio/units${cursorQuery(cursor)}`,
  );
  return readCursorPage<PortfolioUnit>(res, "Failed to load portfolio units");
}

export async function fetchPropertyUnitsPage(
  propertyId: string,
  cursor?: string | null,
): Promise<CursorPage<Unit>> {
  const res = await apiFetch(
    `/properties/${propertyId}/units${cursorQuery(cursor)}`,
  );
  return readCursorPage<Unit>(res, "Failed to load units");
}

export async function fetchProperty(propertyId: string): Promise<Property> {
  const res = await apiFetch(`/properties/${propertyId}`);
  if (res.status === 404) {
    throw new Error("Property not found");
  }
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load property"));
  }
  return (await res.json()) as Property;
}

/** Loads every property page. Prefer fetchPropertiesPage + Load more for lists. */
export async function fetchProperties(): Promise<Property[]> {
  const all: Property[] = [];
  let cursor: string | null = null;
  do {
    const page = await fetchPropertiesPage(cursor);
    all.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return all;
}

export type UnitContext = {
  unit: Unit;
  propertyName: string;
};

export async function fetchUnitContext(
  unitId: string,
): Promise<UnitContext | null> {
  const res = await apiFetch(`/properties/units/${unitId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load unit"));
  }
  const data = (await res.json()) as {
    unit?: Unit;
    propertyName?: string;
  };
  if (!data.unit?.id) return null;
  return {
    unit: data.unit,
    propertyName: data.propertyName ?? "",
  };
}

export async function fetchPaymentHistoryPage(
  unitId: string,
  cursor?: string | null,
): Promise<CursorPage<Transaction>> {
  const res = await apiFetch(
    `/payments/unit/${unitId}${cursorQuery(cursor)}`,
  );
  return readCursorPage<Transaction>(res, "Failed to load payment history");
}

export async function fetchPortfolioPaymentsPage(
  cursor?: string | null,
): Promise<CursorPage<PortfolioPayment>> {
  const res = await apiFetch(`/payments/${cursorQuery(cursor)}`);
  return readCursorPage<PortfolioPayment>(res, "Failed to load money-in feed");
}

export async function fetchReminderLogPage(
  unitId: string,
  cursor?: string | null,
): Promise<CursorPage<Reminder>> {
  const res = await apiFetch(
    `/reminders/unit/${unitId}${cursorQuery(cursor)}`,
  );
  return readCursorPage<Reminder>(res, "Failed to load reminder log");
}

export type UrgentActionsSummary = {
  urgent: number;
  overdue: number;
  lease_ending: number;
  failed: number;
  due_soon: number;
};

export type UrgentActionKind =
  | "overdue_chase"
  | "overdue_no_contact"
  | "due_soon"
  | "lease_ending"
  | "chase_failed";

export type UrgentActionItem = {
  id: string;
  kind: UrgentActionKind | string;
  priority?: number;
  unit_id: string;
  property_id?: string | null;
  property_name?: string | null;
  unit_label?: string | null;
  tenant_name?: string | null;
  tenant_contact?: string | null;
  detail?: string | null;
  reminder_id?: string | null;
  days_until_term_end?: number | null;
  payment_status?: string | null;
};

export type UrgentActionsPayload = {
  items: UrgentActionItem[];
  summary: UrgentActionsSummary;
};

const EMPTY_URGENT_SUMMARY: UrgentActionsSummary = {
  urgent: 0,
  overdue: 0,
  lease_ending: 0,
  failed: 0,
  due_soon: 0,
};

/** Full Action Needed queue (items + summary). */
export async function fetchUrgentActions(): Promise<UrgentActionsPayload> {
  const res = await apiFetch("/reminders/actions");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load action needed"));
  }
  const data = (await res.json()) as {
    items?: UrgentActionItem[];
    summary?: UrgentActionsSummary;
  };
  return {
    items: data.items ?? [],
    summary: data.summary ?? EMPTY_URGENT_SUMMARY,
  };
}

/** Landlord Action Needed counts for the notifications bell. */
export async function fetchUrgentActionsSummary(): Promise<UrgentActionsSummary> {
  const data = await fetchUrgentActions();
  return data.summary;
}

export async function createProperty(payload: {
  name: string;
  address?: string | null;
  type?: "rental" | "estate";
  latitude?: number | null;
  longitude?: number | null;
}): Promise<Property> {
  const res = await apiFetch("/properties/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `Failed to create property (${res.status})`);
  }
  const data = (await res.json()) as Property | Property[];
  const property = Array.isArray(data) ? data[0] : data;
  if (!property?.id) throw new Error("Property was created but no id was returned");
  return property;
}

export async function createUnit(
  propertyId: string,
  payload: {
    label: string;
    rent_amount: number;
    frequency: "daily" | "weekly" | "monthly" | "annual";
    tenant_name?: string | null;
    tenant_contact?: string | null;
    due_day?: number | null;
    due_month?: number | null;
    service_charge_amount?: number | null;
    term_end?: string | null;
  },
): Promise<Unit> {
  const res = await apiFetch(`/properties/${propertyId}/units`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `Failed to create unit (${res.status})`);
  }
  const data = (await res.json()) as Unit | Unit[];
  const unit = Array.isArray(data) ? data[0] : data;
  if (!unit?.id) throw new Error("Unit was created but no id was returned");
  return unit;
}

export async function updateProperty(
  propertyId: string,
  payload: {
    name?: string;
    address?: string | null;
    type?: "rental" | "estate";
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<Property> {
  const res = await apiFetch(`/properties/${propertyId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update property"));
  }
  return (await res.json()) as Property;
}

export async function deleteProperty(propertyId: string): Promise<void> {
  const res = await apiFetch(`/properties/${propertyId}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not delete property"));
  }
}

export async function updateUnit(
  unitId: string,
  payload: {
    label?: string;
    rent_amount?: number;
    frequency?: "daily" | "weekly" | "monthly" | "annual";
    tenant_name?: string | null;
    tenant_contact?: string | null;
    due_day?: number | null;
    due_month?: number | null;
    service_charge_amount?: number | null;
    term_end?: string | null;
  },
): Promise<Unit> {
  const res = await apiFetch(`/properties/units/${unitId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update unit"));
  }
  return (await res.json()) as Unit;
}

export async function deleteUnit(unitId: string): Promise<void> {
  const res = await apiFetch(`/properties/units/${unitId}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not delete unit"));
  }
}

export async function fetchUnitDetail(unitId: string): Promise<{
  unit: Unit;
  propertyName: string;
  propertyId: string | null;
}> {
  const res = await apiFetch(`/properties/units/${unitId}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load unit"));
  }
  const data = (await res.json()) as {
    unit?: Unit;
    propertyName?: string;
    propertyId?: string;
  };
  if (!data.unit?.id) throw new Error("Unit not found");
  return {
    unit: data.unit,
    propertyName: data.propertyName ?? "",
    propertyId: data.propertyId ?? data.unit.property_id ?? null,
  };
}

export async function createPendingPaystackPayment(payload: {
  unit_id: string;
  amount: number;
  charge_type?: "rent" | "service_charge" | "other";
  charge_label?: string | null;
}): Promise<Transaction> {
  const res = await apiFetch("/payments/paystack/pending", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not start Paystack payment"));
  }
  const data = (await res.json()) as Transaction | Transaction[];
  const txn = Array.isArray(data) ? data[0] : data;
  if (!txn?.id) throw new Error("Pending payment created but no id was returned");
  return txn;
}

export async function sendBulkReminders(payload: {
  unit_ids: string[];
}): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  channel?: string;
  errors?: { unit_id: string; label: string; detail: string }[];
  failed_unit_ids?: string[];
}> {
  const res = await apiFetch("/reminders/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not send reminders"));
  }
  return (await res.json()) as {
    sent: number;
    failed: number;
    skipped: number;
    channel?: string;
    errors?: { unit_id: string; label: string; detail: string }[];
    failed_unit_ids?: string[];
  };
}

export async function inviteLead(leadId: string): Promise<{
  invite_url: string;
  invite_sent?: boolean;
  invite_channel?: string | null;
  invite_error?: string | null;
  lead: {
    id: string;
    name: string;
    whatsapp: string;
    unit_count?: number | null;
    source?: string;
    status?: string;
    created_at?: string | null;
  };
}> {
  const res = await apiFetch(`/leads/${leadId}/invite`, { method: "POST" });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not create invite"));
  }
  return (await res.json()) as {
    invite_url: string;
    invite_sent?: boolean;
    invite_channel?: string | null;
    invite_error?: string | null;
    lead: {
      id: string;
      name: string;
      whatsapp: string;
      unit_count?: number | null;
      source?: string;
      status?: string;
      created_at?: string | null;
    };
  };
}

export async function recordManualPayment(payload: {
  unit_id: string;
  amount: number;
  payment_reference?: string | null;
  charge_type?: "rent" | "service_charge" | "other";
  charge_label?: string | null;
}): Promise<Transaction> {
  const res = await apiFetch("/payments/manual", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `Failed to record payment (${res.status})`);
  }
  const data = (await res.json()) as Transaction | Transaction[];
  const txn = Array.isArray(data) ? data[0] : data;
  if (!txn?.id) throw new Error("Payment recorded but no id was returned");
  return txn;
}

export async function confirmPaystackPayment(payload: {
  unit_id: string;
  reference: string;
  transaction_id?: string;
}): Promise<Transaction> {
  const res = await apiFetch("/payments/paystack/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `Failed to confirm payment (${res.status})`);
  }
  const data = (await res.json()) as Transaction | Transaction[];
  const txn = Array.isArray(data) ? data[0] : data;
  if (!txn?.id) throw new Error("Payment confirmed but no id was returned");
  return txn;
}

export async function sendReminder(payload: {
  unit_id: string;
  contact: string;
  message: string;
}): Promise<Reminder> {
  const res = await apiFetch("/reminders/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to send reminder"));
  }
  const data = (await res.json()) as Reminder | Reminder[];
  const reminder = Array.isArray(data) ? data[0] : data;
  if (!reminder?.id) throw new Error("Reminder sent but no id was returned");
  return reminder;
}

export async function retryReminder(reminderId: string): Promise<Reminder> {
  const res = await apiFetch(`/reminders/retry/${reminderId}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not retry notice"));
  }
  const data = (await res.json()) as Reminder | Reminder[];
  const reminder = Array.isArray(data) ? data[0] : data;
  if (!reminder?.id) throw new Error("Retry completed but no log row was returned");
  return reminder;
}

export type LeadStatus = "new" | "contacted" | "invited" | "closed";

export type LeadSource = "access" | "callback";

export type Lead = {
  id: string;
  name: string;
  whatsapp: string;
  unit_count?: number | null;
  source?: LeadSource;
  status?: LeadStatus;
  created_at?: string | null;
};

async function readErrorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    /* ignore */
  }
  return fallback;
}

export type UserProfile = {
  id: string;
  name: string;
  business_name: string | null;
  notification_channel: string;
  notification_prefs?: Record<string, Record<string, boolean>>;
  role: "landlord" | "tenant" | "artisan" | string;
  signup_persona?: string | null;
  signup_unit_count?: number | null;
  signup_years?: string | null;
  phone: string | null;
  email: string | null;
  email_confirmed?: boolean;
  timezone?: string;
  date_format?: "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | string;
  avatar_url?: string | null;
  created_at?: string | null;
};

function parseUserProfile(data: Partial<UserProfile> & { role?: string }): UserProfile {
  const rawRole = String(data.role ?? "landlord").trim() || "landlord";
  const dateFormat = String(data.date_format ?? "dd/mm/yyyy").trim();
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? "").trim(),
    business_name: data.business_name ? String(data.business_name) : null,
    notification_channel: String(data.notification_channel ?? "sms"),
    notification_prefs:
      data.notification_prefs && typeof data.notification_prefs === "object"
        ? (data.notification_prefs as Record<string, Record<string, boolean>>)
        : undefined,
    role: rawRole,
    signup_persona: data.signup_persona ? String(data.signup_persona) : null,
    signup_unit_count:
      typeof data.signup_unit_count === "number" ? data.signup_unit_count : null,
    signup_years: data.signup_years ? String(data.signup_years) : null,
    phone: data.phone ? String(data.phone) : null,
    email: data.email ? String(data.email) : null,
    email_confirmed: Boolean(data.email_confirmed),
    timezone: String(data.timezone ?? "Africa/Lagos").trim() || "Africa/Lagos",
    date_format:
      dateFormat === "mm/dd/yyyy" || dateFormat === "yyyy-mm-dd"
        ? dateFormat
        : "dd/mm/yyyy",
    avatar_url: data.avatar_url ? String(data.avatar_url) : null,
    created_at: data.created_at ?? null,
  };
}

export async function fetchMe(): Promise<UserProfile> {
  const res = await apiFetch("/users/me");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load profile"));
  }
  return parseUserProfile((await res.json()) as Partial<UserProfile>);
}

export async function updateMe(payload: {
  name?: string;
  business_name?: string | null;
  email?: string | null;
  notification_channel?: string | null;
  notification_prefs?: Record<string, Record<string, boolean>> | null;
  timezone?: string | null;
  date_format?: string | null;
  role?: "landlord" | "tenant" | "artisan";
  signup_persona?: string | null;
  signup_unit_count?: number | null;
  signup_years?: string | null;
}): Promise<UserProfile> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.business_name !== undefined) {
    body.business_name = payload.business_name;
  }
  if (payload.email !== undefined) body.email = payload.email;
  if (payload.notification_channel !== undefined) {
    body.notification_channel = payload.notification_channel;
  }
  if (payload.notification_prefs !== undefined) {
    body.notification_prefs = payload.notification_prefs;
  }
  if (payload.timezone !== undefined) body.timezone = payload.timezone;
  if (payload.date_format !== undefined) body.date_format = payload.date_format;
  if (payload.role !== undefined) body.role = payload.role;
  if (payload.signup_persona !== undefined) {
    body.signup_persona = payload.signup_persona;
  }
  if (payload.signup_unit_count !== undefined) {
    body.signup_unit_count = payload.signup_unit_count;
  }
  if (payload.signup_years !== undefined) {
    body.signup_years = payload.signup_years;
  }

  const res = await apiFetch("/users/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update profile"));
  }
  return parseUserProfile((await res.json()) as Partial<UserProfile>);
}

export async function uploadMyAvatar(file: File): Promise<UserProfile> {
  const body = new FormData();
  body.append("file", file);
  const res = await apiFetch("/users/me/avatar", {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not upload photo"));
  }
  return parseUserProfile((await res.json()) as Partial<UserProfile>);
}

export type SavedPaymentMethod = {
  id: string;
  last4?: string | null;
  card_type?: string | null;
  exp_month?: string | null;
  exp_year?: string | null;
  bank?: string | null;
  reusable?: boolean;
  created_at?: string;
};

export async function fetchSavedCards(): Promise<SavedPaymentMethod[]> {
  const res = await apiFetch("/payments/cards");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load cards"));
  }
  const data = (await res.json()) as { items?: SavedPaymentMethod[] };
  return data.items ?? [];
}

export async function confirmSavedCard(
  reference: string,
): Promise<SavedPaymentMethod> {
  const res = await apiFetch("/payments/cards/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not save card"));
  }
  const data = (await res.json()) as { item: SavedPaymentMethod };
  return data.item;
}

export async function deleteSavedCard(cardId: string): Promise<void> {
  const res = await apiFetch(`/payments/cards/${cardId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not remove card"));
  }
}

export async function fetchAdminMe(): Promise<{
  email: string | null;
  is_admin: boolean;
}> {
  const res = await apiFetch("/admin/me");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to check admin access"));
  }
  const data = (await res.json()) as { email?: string | null; is_admin?: boolean };
  return {
    email: data.email ?? null,
    is_admin: Boolean(data.is_admin),
  };
}

export async function trackRenewalBannerViewed(unitId: string): Promise<void> {
  const res = await apiFetch("/events/renewal-banner-viewed", {
    method: "POST",
    body: JSON.stringify({ unit_id: unitId }),
  });
  if (!res.ok) {
    // Best-effort analytics, never block the payments UI.
    return;
  }
}

export type Phase2ExitReport = {
  as_of: string;
  window_days: number;
  window_start: string;
  metric_1_non_rent_collection: {
    active_landlords: number;
    landlords_with_paid_non_rent: number;
    percent: number;
    definition: string;
  };
  metric_2_renewal_visibility: {
    occupied_units: number;
    occupied_with_term_end: number;
    percent: number;
    definition: string;
  };
  metric_2b_renewal_banner_views: {
    event_name: string;
    views: number;
    distinct_landlords: number;
    distinct_units: number;
    definition: string;
  };
};

export async function fetchPhase2Exit(
  windowDays = 30,
): Promise<Phase2ExitReport> {
  const res = await apiFetch(`/admin/phase2-exit?window_days=${windowDays}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load Phase 2 exit metrics"));
  }
  return (await res.json()) as Phase2ExitReport;
}

export type Phase3ExitReport = {
  as_of: string;
  window_days: number;
  window_start: string;
  metric_1_checklist_before_active: {
    activated_tenancies: number;
    with_required_checklist: number;
    percent: number;
    optional_identity_complete: number;
    definition: string;
  };
  metric_2_tenant_initiated_payments: {
    eligible_paid_transactions: number;
    tenant_initiated: number;
    percent: number;
    units_with_tenant_account: number;
    definition: string;
  };
};

export async function fetchPhase3Exit(
  windowDays = 30,
): Promise<Phase3ExitReport> {
  const res = await apiFetch(`/admin/phase3-exit?window_days=${windowDays}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load Phase 3 exit metrics"));
  }
  return (await res.json()) as Phase3ExitReport;
}

export type Phase4ExitReport = {
  as_of: string;
  metric_1_multi_portfolio_manager: {
    managers_with_ge_2_portfolios: number;
    manager_user_ids: string[];
    exit_bar_met: boolean;
    definition: string;
  };
  metric_2_staff_leverage: {
    active_staff_users: number;
    units_under_management: number;
    units_per_staff: number;
    definition: string;
  };
  active_memberships: number;
};

export async function fetchPhase4Exit(): Promise<Phase4ExitReport> {
  const res = await apiFetch(`/admin/phase4-exit`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load Phase 4 exit metrics"));
  }
  return (await res.json()) as Phase4ExitReport;
}

export type StaffPortfolio = {
  owner_id: string;
  role: string;
  membership_id?: string | null;
  property_count: number;
  is_self: boolean;
  owner_label?: string;
  permissions?: string[];
};

export type StaffMembership = {
  id: string;
  owner_id: string;
  user_id?: string | null;
  role: string;
  status: string;
  invite_contact?: string | null;
  invite_token?: string | null;
  claim_path?: string | null;
  can_money?: boolean;
  can_money_log_cash?: boolean;
  can_chase?: boolean;
  can_docs_view?: boolean;
  can_docs_upload?: boolean;
  can_access_visitor_passes?: boolean;
  can_team_invite?: boolean;
};

export async function fetchStaffPortfolios(): Promise<StaffPortfolio[]> {
  const res = await apiFetch("/staff/portfolios");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load portfolios"));
  }
  const data = (await res.json()) as { items: StaffPortfolio[] };
  return data.items ?? [];
}

export async function fetchStaffTeam(): Promise<{
  owner_id: string;
  items: StaffMembership[];
}> {
  const res = await apiFetch("/staff/team");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load team"));
  }
  return (await res.json()) as { owner_id: string; items: StaffMembership[] };
}

export async function inviteStaff(payload: {
  role: "manager" | "caretaker";
  contact: string;
  property_ids?: string[];
}): Promise<{
  claim_path: string;
  invite_token: string;
  membership: StaffMembership;
  notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
}> {
  const res = await apiFetch("/staff/invite", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not invite staff"));
  }
  return (await res.json()) as {
    claim_path: string;
    invite_token: string;
    membership: StaffMembership;
    notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
  };
}

export async function claimStaffInvite(token: string): Promise<StaffMembership> {
  const res = await apiFetch("/staff/claim", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not claim invite"));
  }
  const data = (await res.json()) as { membership: StaffMembership };
  return data.membership;
}

export async function revokeStaffMembership(membershipId: string): Promise<void> {
  const res = await apiFetch(`/staff/${membershipId}/revoke`, { method: "POST" });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not revoke membership"));
  }
}

export async function fetchStaffAudit(limit = 50): Promise<
  Array<{
    id: string;
    actor_user_id: string;
    actor_role: string;
    action: string;
    target_type?: string | null;
    target_id?: string | null;
    created_at: string;
    metadata?: Record<string, unknown>;
  }>
> {
  const res = await apiFetch(`/staff/audit?limit=${limit}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load audit log"));
  }
  const data = (await res.json()) as { items: Array<Record<string, unknown>> };
  return (data.items ?? []) as Array<{
    id: string;
    actor_user_id: string;
    actor_role: string;
    action: string;
    target_type?: string | null;
    target_id?: string | null;
    created_at: string;
    metadata?: Record<string, unknown>;
  }>;
}

export async function fetchOpsOverdue(): Promise<{
  items: Array<{
    unit: Unit;
    property_id: string;
    property_name: string;
    owner_id: string;
    transactions: Transaction[];
  }>;
  owner_id: string;
  role: string;
  loaded?: number;
  capped?: boolean;
}> {
  const res = await apiFetch("/staff/ops/overdue");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load ops view"));
  }
  return (await res.json()) as {
    items: Array<{
      unit: Unit;
      property_id: string;
      property_name: string;
      owner_id: string;
      transactions: Transaction[];
    }>;
    owner_id: string;
    role: string;
    loaded?: number;
    capped?: boolean;
  };
}

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  required: boolean;
  note?: string;
};

export type Tenancy = {
  id: string;
  unit_id: string;
  landlord_id: string;
  tenant_user_id?: string | null;
  tenant_name?: string | null;
  tenant_contact?: string | null;
  start_date?: string | null;
  term_end?: string | null;
  status: string;
  invite_token?: string | null;
  invite_sent_at?: string | null;
  checklist?: ChecklistItem[];
  required_checklist_complete?: boolean;
  can_activate?: boolean;
  activation_blockers?: string[];
  docs_upload_enabled?: boolean;
  docs_belong_to_landlord?: string;
  activated_at?: string | null;
  autopay_enabled?: boolean;
  autopay_payment_method_id?: string | null;
  autopay_days_before?: number;
  units?: {
    id?: string;
    label?: string;
    rent_amount?: number;
    service_charge_amount?: number;
    properties?: { name?: string } | { name?: string }[];
  };
};

export async function fetchUnitTenancy(
  unitId: string,
): Promise<Tenancy | null> {
  const res = await apiFetch(`/tenancies/unit/${unitId}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load tenancy"));
  }
  const data = (await res.json()) as { tenancy?: Tenancy | null };
  return data.tenancy ?? null;
}

export async function createUnitTenancy(
  unitId: string,
  payload: Record<string, unknown> = {},
): Promise<Tenancy> {
  const res = await apiFetch(`/tenancies/unit/${unitId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not create tenancy"));
  }
  const data = (await res.json()) as { tenancy: Tenancy };
  return data.tenancy;
}

export async function updateTenancyChecklist(
  tenancyId: string,
  patch: Record<string, boolean | string>,
): Promise<Tenancy> {
  const res = await apiFetch(`/tenancies/${tenancyId}/checklist`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update checklist"));
  }
  const data = (await res.json()) as { tenancy: Tenancy };
  return data.tenancy;
}

export async function activateTenancy(tenancyId: string): Promise<Tenancy> {
  const res = await apiFetch(`/tenancies/${tenancyId}/activate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not activate occupancy"));
  }
  const data = (await res.json()) as { tenancy: Tenancy };
  return data.tenancy;
}

export async function inviteTenant(
  tenancyId: string,
): Promise<{
  tenancy: Tenancy;
  invite_token: string;
  claim_path: string;
  invite_sent?: boolean;
  invite_channel?: string | null;
  invite_error?: string | null;
}> {
  const res = await apiFetch(`/tenancies/${tenancyId}/invite`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not send invite"));
  }
  return (await res.json()) as {
    tenancy: Tenancy;
    invite_token: string;
    claim_path: string;
    invite_sent?: boolean;
    invite_channel?: string | null;
    invite_error?: string | null;
  };
}

export async function claimTenancyInvite(token: string): Promise<Tenancy> {
  const res = await apiFetch(`/tenancies/claim`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not claim invite"));
  }
  const data = (await res.json()) as { tenancy: Tenancy };
  return data.tenancy;
}

export async function fetchMyTenancy(): Promise<Tenancy | null> {
  const res = await apiFetch(`/tenancies/me/current`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load tenant home"));
  }
  const data = (await res.json()) as { tenancy?: Tenancy | null };
  return data.tenancy ?? null;
}

export async function fetchMyTenancies(): Promise<Tenancy[]> {
  const tenancy = await fetchMyTenancy();
  return tenancy ? [tenancy] : [];
}

export async function updateMyAutopay(payload: {
  enabled: boolean;
  payment_method_id?: string | null;
  days_before?: number;
}): Promise<Tenancy> {
  const res = await apiFetch("/tenancies/me/autopay", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update autopay"));
  }
  const data = (await res.json()) as { tenancy: Tenancy };
  return data.tenancy;
}

export async function chargeSavedCard(payload: {
  unit_id: string;
  payment_method_id: string;
  amount: number;
  charge_type?: string;
}): Promise<{ item: unknown; receipt_url?: string | null }> {
  const res = await apiFetch("/payments/cards/charge", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not charge card"));
  }
  return (await res.json()) as { item: unknown; receipt_url?: string | null };
}

export type MaintenanceRequest = {
  id: string;
  unit_id: string;
  tenancy_id?: string | null;
  landlord_id: string;
  tenant_user_id?: string | null;
  title: string;
  details?: string | null;
  priority: string;
  status: string;
  allow_entry: boolean;
  category?: string;
  photo_url?: string | null;
  preferred_time?: string | null;
  origin?: string;
  artisan_user_id?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  access_pass_id?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  // Nested join from /maintenance/artisan/me
  access_passes?: {
    id: string;
    code: string;
    valid_from?: string;
    valid_until?: string;
    status?: string;
  } | {
    id: string;
    code: string;
    valid_from?: string;
    valid_until?: string;
    status?: string;
  }[] | null;
};

export async function fetchMyMaintenanceRequests(): Promise<MaintenanceRequest[]> {
  const res = await apiFetch("/maintenance/me");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load requests"));
  }
  const data = (await res.json()) as { items?: MaintenanceRequest[] };
  return data.items ?? [];
}

export async function uploadMaintenancePhoto(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await apiFetch("/maintenance/me/photo", {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not upload photo"));
  }
  const data = (await res.json()) as { photo_url?: string };
  if (!data.photo_url) {
    throw new Error("Could not upload photo");
  }
  return data.photo_url;
}

export async function createMyMaintenanceRequest(payload: {
  title: string;
  details?: string;
  priority?: string;
  allow_entry?: boolean;
  category?: string;
  photo_url?: string;
  preferred_time?: string;
}): Promise<MaintenanceRequest> {
  const res = await apiFetch("/maintenance/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not submit request"));
  }
  const data = (await res.json()) as { item: MaintenanceRequest };
  return data.item;
}

export async function cancelMyMaintenanceRequest(
  requestId: string,
): Promise<MaintenanceRequest> {
  const res = await apiFetch(`/maintenance/me/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "canceled" }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not cancel request"));
  }
  const data = (await res.json()) as { item: MaintenanceRequest };
  return data.item;
}

export async function fetchUnitMaintenanceRequests(
  unitId: string,
): Promise<MaintenanceRequest[]> {
  const res = await apiFetch(`/maintenance/unit/${unitId}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load requests"));
  }
  const data = (await res.json()) as { items?: MaintenanceRequest[] };
  return data.items ?? [];
}

export async function updateMaintenanceRequestStatus(
  requestId: string,
  statusValue: string,
): Promise<MaintenanceRequest> {
  const res = await apiFetch(`/maintenance/${requestId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: statusValue }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update request"));
  }
  const data = (await res.json()) as { item: MaintenanceRequest };
  return data.item;
}

export type UtilityProvider = {
  id: string;
  unit_id: string;
  landlord_id: string;
  kind: string;
  provider_name: string;
  account_or_meter?: string | null;
  notes?: string | null;
  how_to_pay?: string | null;
  is_enabled: boolean;
  sort_order?: number;
};

export async function fetchMyUtilities(): Promise<UtilityProvider[]> {
  const res = await apiFetch("/utilities/me");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load utilities"));
  }
  const data = (await res.json()) as { items?: UtilityProvider[] };
  return data.items ?? [];
}

export async function fetchUnitUtilities(
  unitId: string,
): Promise<UtilityProvider[]> {
  const res = await apiFetch(`/utilities/unit/${unitId}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load utilities"));
  }
  const data = (await res.json()) as { items?: UtilityProvider[] };
  return data.items ?? [];
}

export async function createUnitUtility(
  unitId: string,
  payload: {
    kind: string;
    provider_name: string;
    account_or_meter?: string;
    notes?: string;
    how_to_pay?: string;
    is_enabled?: boolean;
  },
): Promise<UtilityProvider> {
  const res = await apiFetch(`/utilities/unit/${unitId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not add provider"));
  }
  const data = (await res.json()) as { item: UtilityProvider };
  return data.item;
}

export async function updateUtilityProvider(
  providerId: string,
  payload: Partial<{
    kind: string;
    provider_name: string;
    account_or_meter: string | null;
    notes: string | null;
    how_to_pay: string | null;
    is_enabled: boolean;
  }>,
): Promise<UtilityProvider> {
  const res = await apiFetch(`/utilities/${providerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update provider"));
  }
  const data = (await res.json()) as { item: UtilityProvider };
  return data.item;
}

export async function deleteUtilityProvider(providerId: string): Promise<void> {
  const res = await apiFetch(`/utilities/${providerId}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not delete provider"));
  }
}

export type AccessPass = {
  id: string;
  landlord_id: string;
  property_id: string;
  unit_id?: string | null;
  subject_type: string;
  subject_user_id?: string | null;
  subject_label: string;
  code: string;
  valid_from: string;
  valid_until: string;
  status: string;
  effective_status?: string;
};

export type AccessPassesPayload = {
  items: AccessPass[];
  loaded: number;
  capped: boolean;
};

export async function fetchAccessPasses(
  propertyId?: string,
): Promise<AccessPassesPayload> {
  const q = propertyId
    ? `?property_id=${encodeURIComponent(propertyId)}`
    : "";
  const res = await apiFetch(`/access/passes${q}`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load access passes"));
  }
  const data = (await res.json()) as Partial<AccessPassesPayload> & {
    items?: AccessPass[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export type AccessOccupant = {
  tenancy_id: string;
  unit_id: string;
  unit_label: string;
  tenant_user_id: string;
  tenant_name: string;
};

export async function fetchAccessOccupants(
  propertyId: string,
): Promise<AccessOccupant[]> {
  const res = await apiFetch(
    `/access/occupants?property_id=${encodeURIComponent(propertyId)}`,
  );
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load occupants"));
  }
  const data = (await res.json()) as { items?: AccessOccupant[] };
  return data.items ?? [];
}

export async function createAccessPass(payload: {
  property_id: string;
  unit_id?: string;
  subject_type: string;
  subject_label: string;
  subject_user_id?: string;
  valid_until: string;
  valid_from?: string;
  code?: string;
}): Promise<AccessPass> {
  const res = await apiFetch("/access/passes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not issue pass"));
  }
  const data = (await res.json()) as { item: AccessPass };
  return data.item;
}

export async function revokeAccessPass(passId: string): Promise<AccessPass> {
  const res = await apiFetch(`/access/passes/${passId}/revoke`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not revoke pass"));
  }
  const data = (await res.json()) as { item: AccessPass };
  return data.item;
}

export async function fetchMyAccessPasses(): Promise<AccessPassesPayload> {
  const res = await apiFetch("/access/me");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load your passes"));
  }
  const data = (await res.json()) as Partial<AccessPassesPayload> & {
    items?: AccessPass[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export type ArtisanRosterItem = {
  id: string;
  landlord_id: string;
  artisan_user_id?: string | null;
  invite_token?: string | null;
  invite_contact?: string | null;
  status: string;
};

export type ArtisanRosterPayload = {
  items: ArtisanRosterItem[];
  loaded: number;
  capped: boolean;
};

export async function fetchArtisanRoster(): Promise<ArtisanRosterPayload> {
  const res = await apiFetch("/artisans/roster");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load artisans"));
  }
  const data = (await res.json()) as Partial<ArtisanRosterPayload> & {
    items?: ArtisanRosterItem[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function inviteArtisan(invite_contact: string): Promise<{
  item: ArtisanRosterItem;
  claim_path: string;
  notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
}> {
  const res = await apiFetch("/artisans/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite_contact }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not invite artisan"));
  }
  return (await res.json()) as {
    item: ArtisanRosterItem;
    claim_path: string;
    notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
  };
}

export async function claimArtisanInvite(payload: {
  token: string;
  display_name: string;
  trades?: string[] | string;
  phone?: string;
}): Promise<unknown> {
  const res = await apiFetch("/artisans/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not claim invite"));
  }
  return res.json();
}

export async function fetchArtisanProfile(): Promise<{
  user_id: string;
  display_name: string;
  trades?: string[];
  phone?: string | null;
  status: string;
} | null> {
  const res = await apiFetch("/artisans/me");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load profile"));
  }
  const data = (await res.json()) as { profile?: { user_id: string; display_name: string; trades?: string[]; phone?: string | null; status: string } | null };
  return data.profile ?? null;
}

export async function createUnitWorkOrder(
  unitId: string,
  payload: { title: string; details?: string; priority?: string },
): Promise<MaintenanceRequest> {
  const res = await apiFetch(`/maintenance/unit/${unitId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not create work order"));
  }
  const data = (await res.json()) as { item: MaintenanceRequest };
  return data.item;
}

export async function assignMaintenanceArtisan(
  requestId: string,
  payload: {
    artisan_user_id: string;
    scheduled_start?: string;
    scheduled_end?: string;
    issue_access_pass?: boolean;
  },
): Promise<{
  item: MaintenanceRequest;
  notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
}> {
  const res = await apiFetch(`/maintenance/${requestId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not assign artisan"));
  }
  const data = (await res.json()) as {
    item: MaintenanceRequest;
    notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
  };
  return { item: data.item, notify: data.notify ?? null };
}

export async function completeMaintenanceRequest(
  requestId: string,
): Promise<MaintenanceRequest> {
  const res = await apiFetch(`/maintenance/${requestId}/complete`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not complete job"));
  }
  const data = (await res.json()) as { item: MaintenanceRequest };
  return data.item;
}

export type ArtisanJobsPayload = {
  items: MaintenanceRequest[];
  loaded: number;
  capped: boolean;
};

export async function fetchArtisanJobs(): Promise<ArtisanJobsPayload> {
  const res = await apiFetch("/maintenance/artisan/me");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load jobs"));
  }
  const data = (await res.json()) as Partial<ArtisanJobsPayload> & {
    items?: MaintenanceRequest[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export type MaintenanceBoardPayload = {
  items: MaintenanceRequest[];
  open_count: number;
  done_count: number;
  loaded: number;
  capped: boolean;
};

export async function fetchMaintenanceBoard(): Promise<MaintenanceBoardPayload> {
  const res = await apiFetch("/maintenance/board");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load work orders"));
  }
  const data = (await res.json()) as Partial<MaintenanceBoardPayload> & {
    items?: MaintenanceRequest[];
  };
  const items = data.items ?? [];
  return {
    items,
    open_count: data.open_count ?? items.filter(
      (i) => i.status === "new" || i.status === "in_progress",
    ).length,
    done_count: data.done_count ?? items.filter(
      (i) => i.status === "resolved" || i.status === "canceled",
    ).length,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function fetchWorkOrdersOpenCount(): Promise<number> {
  const res = await apiFetch("/maintenance/open-count");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load open count"));
  }
  const data = (await res.json()) as { open_count?: number };
  return Number(data.open_count) || 0;
}

export type DocumentCollectionCapabilities = {
  request: boolean;
  cancel_request: boolean;
  submit_requested: boolean;
  replace: boolean;
  review: boolean;
  open: boolean;
  privacy_request: boolean;
};

export type TenancyDocumentSubmission = {
  id: string;
  version: number;
  review_status: string;
  document?: { id: string; file_name?: string | null } | null;
};

export type TenancyDocumentRequest = {
  id: string;
  tenancy_id: string;
  doc_type: "agreement" | "reference";
  title: string;
  instructions?: string | null;
  due_on?: string | null;
  status: string;
  current_submission_id?: string | null;
  policy?: {
    purpose_code: string;
    lawful_basis: string;
    privacy_notice_version: string;
    privacy_notice_url: string;
  } | null;
  submissions: TenancyDocumentSubmission[];
  events: Array<{
    id?: string;
    event_type: string;
    reason_code?: string | null;
    comment?: string | null;
  }>;
};

export type TenancyPrivacyRequest = {
  id: string;
  request_type:
    | "access"
    | "rectification"
    | "erasure"
    | "restriction"
    | "objection"
    | "portability";
  status: string;
  due_on?: string | null;
};

export type TenancyPrivacyCasePolicy = {
  version: string;
  notice_version: string;
  notice_url: string;
};

const DISABLED_DOCUMENT_COLLECTION: DocumentCollectionCapabilities = {
  request: false,
  cancel_request: false,
  submit_requested: false,
  replace: false,
  review: false,
  open: false,
  privacy_request: false,
};

export async function fetchTenancyDocuments(tenancyId: string): Promise<{
  docs_upload_enabled: boolean;
  capabilities: { read: boolean; acknowledge: boolean };
  items: Array<{
    id: string;
    doc_type: string;
    file_name: string;
    url?: string | null;
    can_open?: boolean;
    expires_on?: string | null;
    requires_ack?: boolean;
    acknowledged_at?: string | null;
    acknowledgment_text_version?: string | null;
    scan_status?: "pending" | "clean" | "rejected";
  }>;
  message?: string;
}> {
  const res = await apiFetch(`/tenancies/${tenancyId}/documents`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load documents"));
  }
  const data = (await res.json()) as {
    docs_upload_enabled: boolean;
    items: Array<{
      id: string;
      doc_type: string;
      file_name: string;
      url?: string | null;
      expires_on?: string | null;
      requires_ack?: boolean;
      acknowledged_at?: string | null;
      acknowledgment_text_version?: string | null;
      scan_status?: "pending" | "clean" | "rejected";
    }>;
    message?: string;
  };
  const readable = Boolean(data.docs_upload_enabled);
  return {
    ...data,
    capabilities: {
      read: readable,
      acknowledge: readable,
    },
    items: (data.items ?? []).map((item) => ({
      ...item,
      can_open: Boolean(item.url),
    })),
  };
}

export async function fetchTenancyDocumentRequests(
  _tenancyId: string,
): Promise<{
  capabilities: DocumentCollectionCapabilities;
  items: TenancyDocumentRequest[];
  message?: string;
}> {
  return {
    capabilities: DISABLED_DOCUMENT_COLLECTION,
    items: [],
    message:
      "Requested document collection is awaiting legal and privacy approval.",
  };
}

export async function fetchTenancyPrivacyRequests(
  _tenancyId: string,
): Promise<{
  capabilities: DocumentCollectionCapabilities;
  items: TenancyPrivacyRequest[];
}> {
  return {
    capabilities: DISABLED_DOCUMENT_COLLECTION,
    items: [],
  };
}

export async function fetchTenancyPrivacyCasePolicies(
  _tenancyId: string,
): Promise<TenancyPrivacyCasePolicy[]> {
  return [];
}

export async function openTenancyDocument(
  tenancyId: string,
  documentId: string,
): Promise<{ url: string; expires_in?: number }> {
  const documents = await fetchTenancyDocuments(tenancyId);
  const document = documents.items.find((item) => item.id === documentId);
  if (!document?.url) throw new Error("Document is not available to open");
  return { url: document.url };
}

export async function submitRequestedTenancyDocument(_payload: {
  tenancyId: string;
  requestId: string;
  document: File;
  noticeVersion: string;
  replacesSubmissionId?: string | null;
  idempotencyKey: string;
}): Promise<never> {
  throw new Error(
    "Requested document uploads are awaiting legal and privacy approval.",
  );
}

export async function createTenancyPrivacyRequest(
  _tenancyId: string,
  _payload: {
    request_type: TenancyPrivacyRequest["request_type"];
    privacy_policy_version: string;
  },
  _idempotencyKey: string,
): Promise<never> {
  throw new Error(
    "In-product privacy requests are awaiting approved policy.",
  );
}

export async function uploadTenancyDocument(payload: {
  tenancyId: string;
  doc_type: string;
  file_name: string;
  content_type: string;
  content_base64: string;
  expires_on?: string | null;
  requires_ack?: boolean;
}): Promise<void> {
  const res = await apiFetch(`/tenancies/${payload.tenancyId}/documents`, {
    method: "POST",
    body: JSON.stringify({
      doc_type: payload.doc_type,
      file_name: payload.file_name,
      content_type: payload.content_type,
      content_base64: payload.content_base64,
      expires_on: payload.expires_on || null,
      requires_ack: Boolean(payload.requires_ack),
    }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not upload document"));
  }
}

export function docsUploadEnabledClient(): boolean {
  const raw = (process.env.NEXT_PUBLIC_DOCS_UPLOAD_ENABLED || "false")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function fetchLeadsPage(
  cursor?: string | null,
): Promise<CursorPage<Lead>> {
  const res = await apiFetch(`/leads/${cursorQuery(cursor)}`);
  return readCursorPage<Lead>(res, "Failed to load leads");
}

export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
): Promise<Lead> {
  const res = await apiFetch(`/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update lead"));
  }
  return (await res.json()) as Lead;
}

// --- Competitive ops gaps (applications, expenses, pubs, tasks, fees) ---

export type RentalApplication = {
  id: string;
  landlord_id: string;
  property_id: string;
  unit_id: string;
  invite_token: string;
  status: string;
  applicant_name?: string | null;
  applicant_email?: string | null;
  applicant_phone?: string | null;
  notes?: string | null;
  screening_answers?: Record<string, string>;
  created_at?: string;
};

export type ApplicationsListPayload = {
  items: RentalApplication[];
  pending_count: number;
  loaded: number;
  capped: boolean;
};

export async function fetchApplications(): Promise<ApplicationsListPayload> {
  const res = await apiFetch("/applications/");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load applications"));
  const data = (await res.json()) as Partial<ApplicationsListPayload> & {
    items?: RentalApplication[];
  };
  const items = data.items ?? [];
  return {
    items,
    pending_count:
      data.pending_count ??
      items.filter((a) => a.status === "submitted").length,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function fetchApplicationsPendingCount(): Promise<number> {
  const res = await apiFetch("/applications/pending-count");
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load pending count"));
  }
  const data = (await res.json()) as { pending_count?: number };
  return Number(data.pending_count) || 0;
}

export async function openApplicationInvite(unitId: string): Promise<{
  item: RentalApplication;
  apply_path: string;
  apply_url: string;
}> {
  const res = await apiFetch(`/applications/unit/${unitId}`, { method: "POST" });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not open apply link"));
  return (await res.json()) as {
    item: RentalApplication;
    apply_path: string;
    apply_url: string;
  };
}

export async function previewApplicationToken(token: string): Promise<{
  token: string;
  status: string;
  unit_label?: string | null;
  property_name?: string | null;
  property_address?: string | null;
  questions: Array<{ key: string; label: string }>;
}> {
  const base = apiBaseUrl();
  const res = await fetchWithTimeout(
    `${base}/applications/token/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(await readErrorDetail(res, "Invite not found"));
  return (await res.json()) as {
    token: string;
    status: string;
    unit_label?: string | null;
    property_name?: string | null;
    property_address?: string | null;
    questions: Array<{ key: string; label: string }>;
  };
}

export async function submitApplication(
  token: string,
  payload: {
    applicant_name: string;
    applicant_email?: string;
    applicant_phone?: string;
    notes?: string;
    screening_answers?: Record<string, string>;
  },
): Promise<RentalApplication> {
  const res = await apiFetch(`/applications/token/${encodeURIComponent(token)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not submit application"));
  const data = (await res.json()) as { item: RentalApplication };
  return data.item;
}

export async function decideApplication(
  applicationId: string,
  status: "approved" | "rejected" | "closed",
): Promise<RentalApplication> {
  const res = await apiFetch(`/applications/${applicationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not update application"));
  const data = (await res.json()) as { item: RentalApplication };
  return data.item;
}

export async function connectLandlord(payload: {
  landlord_email: string;
  landlord_name?: string;
  message?: string;
}): Promise<void> {
  const res = await apiFetch("/applications/connect-landlord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not send invite"));
}

export type Expense = {
  id: string;
  category: string;
  amount: number;
  currency: string;
  paid_on: string;
  vendor?: string | null;
  notes?: string | null;
  property_id?: string | null;
  unit_id?: string | null;
};

export type ExpensesListPayload = {
  items: Expense[];
  loaded: number;
  capped: boolean;
};

export async function fetchExpenses(): Promise<ExpensesListPayload> {
  const res = await apiFetch("/expenses");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load expenses"));
  const data = (await res.json()) as Partial<ExpensesListPayload> & {
    items?: Expense[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function createExpense(payload: {
  category: string;
  amount: number;
  paid_on?: string;
  vendor?: string;
  notes?: string;
  property_id?: string;
  unit_id?: string;
}): Promise<Expense> {
  const res = await apiFetch("/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not save expense"));
  const data = (await res.json()) as { item: Expense };
  return data.item;
}

export async function deleteExpense(expenseId: string): Promise<void> {
  const res = await apiFetch(`/expenses/${expenseId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not delete expense"));
}

export type RentRollReport = {
  generated_at: string;
  items: Array<{
    unit_id: string;
    unit_label?: string | null;
    property_id?: string | null;
    property_name?: string | null;
    rent_amount?: number | null;
    currency: string;
    frequency?: string | null;
    tenancy_status?: string | null;
    tenant_name?: string | null;
    tenant_contact?: string | null;
    term_end?: string | null;
  }>;
  month_expenses_total: number;
  occupied: number;
  vacant: number;
  loaded?: number;
  capped?: boolean;
  expenses_capped?: boolean;
};

export async function fetchRentRoll(): Promise<RentRollReport> {
  const res = await apiFetch("/reports/rent-roll");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load rent roll"));
  return (await res.json()) as RentRollReport;
}

export type ScheduledFee = {
  id: string;
  unit_id: string;
  label: string;
  amount: number;
  currency: string;
  due_on: string;
  charge_type: string;
  status: string;
};

export type ScheduledFeesPayload = {
  items: ScheduledFee[];
  loaded: number;
  capped: boolean;
};

export async function fetchUnitFees(unitId: string): Promise<ScheduledFeesPayload> {
  const res = await apiFetch(`/fees/unit/${unitId}`);
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load fees"));
  const data = (await res.json()) as Partial<ScheduledFeesPayload> & {
    items?: ScheduledFee[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function createUnitFee(
  unitId: string,
  payload: {
    label: string;
    amount: number;
    due_on: string;
    charge_type?: string;
    tenancy_id?: string;
  },
): Promise<ScheduledFee> {
  const res = await apiFetch(`/fees/unit/${unitId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not create fee"));
  const data = (await res.json()) as { item: ScheduledFee };
  return data.item;
}

export async function updateFeeStatus(
  feeId: string,
  status: string,
): Promise<ScheduledFee> {
  const res = await apiFetch(`/fees/${feeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not update fee"));
  const data = (await res.json()) as { item: ScheduledFee };
  return data.item;
}

export async function fetchMyFees(): Promise<ScheduledFeesPayload> {
  const res = await apiFetch("/fees/me");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load fees"));
  const data = (await res.json()) as Partial<ScheduledFeesPayload> & {
    items?: ScheduledFee[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export type Publication = {
  id: string;
  title: string;
  body: string;
  property_id?: string | null;
  published_at?: string;
  is_read?: boolean;
};

export type PublicationsListPayload = {
  items: Publication[];
  loaded: number;
  capped: boolean;
};

export async function fetchPublications(): Promise<PublicationsListPayload> {
  const res = await apiFetch("/publications/");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load publications"));
  const data = (await res.json()) as Partial<PublicationsListPayload> & {
    items?: Publication[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function createPublication(payload: {
  title: string;
  body: string;
  property_id?: string;
}): Promise<Publication> {
  const res = await apiFetch("/publications/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not publish"));
  const data = (await res.json()) as { item: Publication };
  return data.item;
}

export async function archivePublication(id: string): Promise<void> {
  const res = await apiFetch(`/publications/${id}/archive`, { method: "POST" });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not archive"));
}

export async function fetchMyPublications(): Promise<{
  items: Publication[];
  unread_count: number;
}> {
  const res = await apiFetch("/publications/me");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load bulletin"));
  return (await res.json()) as { items: Publication[]; unread_count: number };
}

export async function markPublicationRead(id: string): Promise<void> {
  const res = await apiFetch(`/publications/${id}/read`, { method: "POST" });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not mark read"));
}

export type OpsTask = {
  id: string;
  title: string;
  details?: string | null;
  due_on?: string | null;
  status: string;
  audience: string;
  tenant_user_id?: string | null;
  unit_id?: string | null;
  tenancy_id?: string | null;
};

export type CalendarEvent = {
  kind: string;
  id: string;
  title?: string | null;
  date?: string | null;
  meta?: Record<string, unknown>;
};

export type TasksListPayload = {
  items: OpsTask[];
  loaded: number;
  capped: boolean;
};

export async function fetchTasks(): Promise<TasksListPayload> {
  const res = await apiFetch("/tasks/");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load tasks"));
  const data = (await res.json()) as Partial<TasksListPayload> & {
    items?: OpsTask[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function createTask(payload: {
  title: string;
  details?: string;
  due_on?: string;
  audience?: string;
  tenancy_id?: string;
  tenant_user_id?: string;
  unit_id?: string;
}): Promise<{
  item: OpsTask;
  notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
}> {
  const res = await apiFetch("/tasks/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not create task"));
  const data = (await res.json()) as {
    item?: OpsTask | null;
    notify?: { sent?: boolean; channel?: string | null; error?: string | null } | null;
  } | null;
  if (!data?.item) {
    throw new Error("Could not create task");
  }
  return {
    item: data.item,
    notify: data.notify ?? null,
  };
}

export async function updateTaskStatus(
  taskId: string,
  status: string,
): Promise<OpsTask> {
  const res = await apiFetch(`/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not update task"));
  const data = (await res.json()) as { item: OpsTask };
  return data.item;
}

export async function fetchMyTasks(): Promise<OpsTask[]> {
  const res = await apiFetch("/tasks/me");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load tasks"));
  const data = (await res.json()) as { items?: OpsTask[] };
  return data.items ?? [];
}

export type CalendarPayload = {
  items: CalendarEvent[];
  loaded: number;
  capped: boolean;
};

export async function fetchCalendar(): Promise<CalendarPayload> {
  const res = await apiFetch("/tasks/calendar");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load calendar"));
  const data = (await res.json()) as Partial<CalendarPayload> & {
    items?: CalendarEvent[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function fetchMyCalendar(): Promise<CalendarEvent[]> {
  const res = await apiFetch("/tasks/calendar/me");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load calendar"));
  const data = (await res.json()) as { items?: CalendarEvent[] };
  return data.items ?? [];
}

export type PortfolioTenancy = {
  id: string;
  unit_id: string;
  status: string;
  tenant_name?: string | null;
  tenant_contact?: string | null;
  tenant_user_id?: string | null;
  term_end?: string | null;
  unit_label?: string | null;
  property_name?: string | null;
  property_id?: string | null;
};

export type PortfolioTenanciesPayload = {
  items: PortfolioTenancy[];
  loaded: number;
  capped: boolean;
};

export async function fetchPortfolioTenancies(): Promise<PortfolioTenanciesPayload> {
  const res = await apiFetch("/tenancies/");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load tenancies"));
  const data = (await res.json()) as Partial<PortfolioTenanciesPayload> & {
    items?: PortfolioTenancy[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function acknowledgeTenancyDocument(
  tenancyId: string,
  documentId: string,
): Promise<void> {
  const res = await apiFetch(
    `/tenancies/${tenancyId}/documents/${documentId}/acknowledge`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not acknowledge"));
}

// --- Messages hub (TenantCloud-style) ---

export type MessageThread = {
  id: string;
  kind: "chat" | "maintenance" | string;
  landlord_id: string;
  tenant_user_id?: string | null;
  unit_id?: string | null;
  tenancy_id?: string | null;
  maintenance_request_id?: string | null;
  subject?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  created_at?: string;
  unread?: boolean;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  kind?: "user" | "payment" | string;
  meta?: {
    transaction_id?: string;
    amount?: number | string;
    currency?: string;
    status?: string;
    charge_type?: string;
    charge_label?: string;
    receipt_url?: string | null;
  } | null;
};

export type MessageContact = {
  role: "tenant" | "landlord" | string;
  tenancy_id: string;
  unit_id?: string | null;
  user_id?: string | null;
  name: string;
  unit_label?: string | null;
  property_name?: string | null;
  tenancy_status?: string | null;
};

export async function fetchMessageUnreadCount(): Promise<number> {
  const res = await apiFetch("/messages/unread-count");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load unread"));
  const data = (await res.json()) as { unread_threads?: number };
  return data.unread_threads ?? 0;
}

export async function fetchMessageContacts(): Promise<MessageContact[]> {
  const res = await apiFetch("/messages/contacts");
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load contacts"));
  const data = (await res.json()) as { items?: MessageContact[] };
  return data.items ?? [];
}

export type MessageThreadsPayload = {
  items: MessageThread[];
  loaded: number;
  capped: boolean;
};

export async function fetchMessageThreads(
  kind?: "chat" | "maintenance",
): Promise<MessageThreadsPayload> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const res = await apiFetch(`/messages/threads${q}`);
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load threads"));
  const data = (await res.json()) as Partial<MessageThreadsPayload> & {
    items?: MessageThread[];
  };
  const items = data.items ?? [];
  return {
    items,
    loaded: data.loaded ?? items.length,
    capped: Boolean(data.capped),
  };
}

export async function openChatThread(tenancyId: string): Promise<MessageThread> {
  const res = await apiFetch("/messages/threads/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenancy_id: tenancyId }),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not open chat"));
  const data = (await res.json()) as { item: MessageThread };
  return data.item;
}

export async function openMaintenanceThread(
  requestId: string,
): Promise<MessageThread> {
  const res = await apiFetch(`/messages/threads/maintenance/${requestId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not open thread"));
  const data = (await res.json()) as { item: MessageThread };
  return data.item;
}

export async function fetchThreadMessages(
  threadId: string,
): Promise<{ items: ChatMessage[]; peer_last_read_at: string | null }> {
  const res = await apiFetch(`/messages/threads/${threadId}/messages`);
  if (!res.ok) throw new Error(await readErrorDetail(res, "Failed to load messages"));
  const data = (await res.json()) as {
    items?: ChatMessage[];
    peer_last_read_at?: string | null;
  };
  return {
    items: data.items ?? [],
    peer_last_read_at: data.peer_last_read_at ?? null,
  };
}

export async function sendThreadMessage(
  threadId: string,
  body: string,
): Promise<ChatMessage> {
  const res = await apiFetch(`/messages/threads/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not send"));
  const data = (await res.json()) as { item: ChatMessage };
  return data.item;
}

export async function markThreadRead(threadId: string): Promise<void> {
  const res = await apiFetch(`/messages/threads/${threadId}/read`, { method: "POST" });
  if (!res.ok) throw new Error(await readErrorDetail(res, "Could not mark read"));
}
