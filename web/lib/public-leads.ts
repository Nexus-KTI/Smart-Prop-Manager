/** Shared invite / lead helpers (no auth). */

export const PUBLIC_LEADS_TIMEOUT_MS = 25_000;

function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8000"
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PUBLIC_LEADS_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error("Request timed out. Check your connection, then retry.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export type InviteValidation = {
  valid: boolean;
  name: string | null;
  whatsapp: string | null;
};

export async function validateSignupInvite(
  inviteId: string,
): Promise<InviteValidation> {
  const id = inviteId.trim();
  if (!id) return { valid: false, name: null, whatsapp: null };
  try {
    const res = await fetchWithTimeout(
      `${apiBaseUrl()}/public/invites/${encodeURIComponent(id)}`,
      { method: "GET", cache: "no-store" },
    );
    if (!res.ok) {
      return { valid: false, name: null, whatsapp: null };
    }
    const data = (await res.json()) as InviteValidation;
    return {
      valid: Boolean(data.valid),
      name: data.name ?? null,
      whatsapp: data.whatsapp ?? null,
    };
  } catch {
    return { valid: false, name: null, whatsapp: null };
  }
}

export async function submitPublicLead(input: {
  name: string;
  whatsapp: string;
  unit_count?: number | null;
  source: "access" | "callback";
  captcha_token?: string | null;
}): Promise<void> {
  const res = await fetchWithTimeout(`${apiBaseUrl()}/public/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      whatsapp: input.whatsapp,
      unit_count: input.unit_count ?? null,
      source: input.source,
      captcha_token: input.captcha_token ?? null,
    }),
  });
  if (res.ok) return;
  let detail = "Could not submit. Please try again.";
  try {
    const body = (await res.json()) as { detail?: string };
    if (typeof body.detail === "string" && body.detail.trim()) {
      detail = body.detail;
    }
  } catch {
    /* keep default */
  }
  throw new Error(detail);
}
