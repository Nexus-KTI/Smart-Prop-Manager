import type { Session } from "@supabase/supabase-js";

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

/** Public — no auth. Used after phone OTP when Supabase returns OK but SMS may have failed. */
export async function checkSmsDelivery(phone: string): Promise<{
  found: boolean;
  status: string | null;
  error_code: number | null;
  error_message: string | null;
  hint: string | null;
  account_type: string | null;
}> {
  const base = apiBaseUrl();
  const res = await fetch(
    `${base}/notify/sms-delivery?phone=${encodeURIComponent(phone)}`,
    { method: "GET", cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error("Could not check SMS delivery status");
  }
  return res.json();
}

/** Single-flight refresh — concurrent refreshSession() races cause "Already Used". */
let refreshInFlight: Promise<Session | null> | null = null;

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
        // Another tab/middleware may have won the refresh race — re-read storage.
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
  if (init.body && !headers.has("Content-Type")) {
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

  const response = await fetch(url, {
    ...init,
    headers: buildHeaders(init, accessToken),
  });

  // Expired JWT that slipped past skew check — refresh once and retry.
  if (response.status === 401 && !retried) {
    refreshInFlight = null;
    const refreshed = await resolveAccessToken();
    if (refreshed) {
      return apiFetch(path, init, true);
    }
  }

  return response;
}

async function readJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
  role: "landlord" | "tenant";
  phone: string | null;
  email: string | null;
  created_at?: string | null;
};

function parseUserProfile(data: Partial<UserProfile> & { role?: string }): UserProfile {
  const role = data.role === "tenant" ? "tenant" : "landlord";
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? "").trim(),
    business_name: data.business_name ? String(data.business_name) : null,
    notification_channel: String(data.notification_channel ?? "sms"),
    role,
    phone: data.phone ? String(data.phone) : null,
    email: data.email ? String(data.email) : null,
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

  const res = await apiFetch("/users/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Could not update profile"));
  }
  return parseUserProfile((await res.json()) as Partial<UserProfile>);
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
    // Best-effort analytics — never block the payments UI.
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
}): Promise<{ claim_path: string; invite_token: string; membership: StaffMembership }> {
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
  checklist?: ChecklistItem[];
  required_checklist_complete?: boolean;
  can_activate?: boolean;
  activation_blockers?: string[];
  docs_upload_enabled?: boolean;
  docs_belong_to_landlord?: string;
  activated_at?: string | null;
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
): Promise<{ tenancy: Tenancy; invite_token: string; claim_path: string }> {
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

export async function fetchTenancyDocuments(tenancyId: string): Promise<{
  docs_upload_enabled: boolean;
  items: Array<{
    id: string;
    doc_type: string;
    file_name: string;
    url?: string | null;
    expires_on?: string | null;
  }>;
  message?: string;
}> {
  const res = await apiFetch(`/tenancies/${tenancyId}/documents`);
  if (!res.ok) {
    throw new Error(await readErrorDetail(res, "Failed to load documents"));
  }
  return (await res.json()) as {
    docs_upload_enabled: boolean;
    items: Array<{
      id: string;
      doc_type: string;
      file_name: string;
      url?: string | null;
      expires_on?: string | null;
    }>;
    message?: string;
  };
}

export async function uploadTenancyDocument(payload: {
  tenancyId: string;
  doc_type: string;
  file_name: string;
  content_type: string;
  content_base64: string;
  expires_on?: string | null;
}): Promise<void> {
  const res = await apiFetch(`/tenancies/${payload.tenancyId}/documents`, {
    method: "POST",
    body: JSON.stringify({
      doc_type: payload.doc_type,
      file_name: payload.file_name,
      content_type: payload.content_type,
      content_base64: payload.content_base64,
      expires_on: payload.expires_on || null,
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
