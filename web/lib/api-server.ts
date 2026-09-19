import { createClient } from "@/lib/supabase/server";

import type { Property, Reminder, Transaction, Unit } from "./types";

export const API_SERVER_TIMEOUT_MS = 25_000;

function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8000"
  );
}

async function accessToken(): Promise<string | undefined> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, API_SERVER_TIMEOUT_MS);
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
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetchWithTimeout(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("timed out")
    ) {
      return new Response(JSON.stringify({ error: "api_timeout" }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "api_unreachable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function parseOne<T extends { id?: string }>(
  res: Response,
  label: string,
): Promise<T> {
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Failed to ${label} (${res.status})`);
  }
  const data = (await res.json()) as T | T[];
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) {
    throw new Error(`${label} succeeded but no id was returned`);
  }
  return row;
}

export type CursorPage<T> = {
  items: T[];
  next_cursor: string | null;
};

export async function fetchPropertiesPage(
  cursor?: string | null,
): Promise<CursorPage<Property>> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await apiFetch(`/properties/${qs}`);
  if (!res.ok) {
    throw new Error((await res.text()) || "Failed to load properties");
  }
  const data = (await res.json()) as
    | Property[]
    | { items?: Property[]; next_cursor?: string | null };
  if (Array.isArray(data)) {
    return { items: data, next_cursor: null };
  }
  return {
    items: Array.isArray(data.items) ? data.items : [],
    next_cursor: data.next_cursor ?? null,
  };
}

export async function fetchAllProperties(): Promise<Property[]> {
  const all: Property[] = [];
  let cursor: string | null = null;
  do {
    const page = await fetchPropertiesPage(cursor);
    all.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return all;
}

export async function fetchProperty(propertyId: string): Promise<Property> {
  const res = await apiFetch(`/properties/${propertyId}`);
  if (!res.ok) {
    throw new Error((await res.text()) || "Failed to load property");
  }
  return (await res.json()) as Property;
}

export async function fetchUnitDetail(unitId: string): Promise<{
  unit: Unit;
  propertyName: string;
  propertyId: string | null;
}> {
  const res = await apiFetch(`/properties/units/${unitId}`);
  if (!res.ok) {
    throw new Error((await res.text()) || "Failed to load unit");
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
  return parseOne<Property>(res, "create property");
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
  return parseOne<Unit>(res, "create unit");
}

export async function recordManualPayment(payload: {
  unit_id: string;
  amount: number;
}): Promise<Transaction> {
  const res = await apiFetch("/payments/manual", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(payload),
  });
  return parseOne<Transaction>(res, "record payment");
}

export async function confirmPaystackPayment(payload: {
  unit_id: string;
  reference: string;
  transaction_id: string;
}): Promise<Transaction> {
  const res = await apiFetch("/payments/paystack/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return parseOne<Transaction>(res, "confirm payment");
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
  return parseOne<Reminder>(res, "send reminder");
}
