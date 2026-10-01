/**
 * Session length policy, enforced in middleware (free Supabase plan has no
 * server-side inactivity / time-box settings). Keep in sync with
 * `public.revoke_stale_sessions()` in sql/040_session_policy.sql.
 */

export type SessionPolicyKind = "landlord" | "tenant" | "admin";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export const SESSION_POLICY: Record<
  SessionPolicyKind,
  { idleSeconds: number; maxSeconds: number }
> = {
  landlord: { idleSeconds: 7 * DAY, maxSeconds: 30 * DAY },
  tenant: { idleSeconds: 14 * DAY, maxSeconds: 60 * DAY },
  admin: { idleSeconds: 12 * HOUR, maxSeconds: 24 * HOUR },
};

export const LAST_SEEN_COOKIE = "nx_seen";

/** Only rewrite the last-seen cookie when it is older than this. */
export const LAST_SEEN_REFRESH_SECONDS = 5 * 60;

export function policyKindFor(
  role: string | null | undefined,
  isAdmin: boolean,
): SessionPolicyKind {
  if (isAdmin) return "admin";
  if (role === "tenant" || role === "artisan") return "tenant";
  return "landlord";
}

export type AccessTokenClaims = {
  sessionId: string | null;
  /** Epoch seconds of the first sign-in factor for this session. */
  authAt: number | null;
};

export function readAccessTokenClaims(
  accessToken: string | null | undefined,
): AccessTokenClaims {
  const empty = { sessionId: null, authAt: null };
  const payload = accessToken?.split(".")[1];
  if (!payload) return empty;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as {
      session_id?: unknown;
      amr?: { timestamp?: unknown }[];
    };
    const timestamps = Array.isArray(claims.amr)
      ? claims.amr
          .map((entry) => entry?.timestamp)
          .filter((ts): ts is number => typeof ts === "number" && ts > 0)
      : [];
    return {
      sessionId:
        typeof claims.session_id === "string" ? claims.session_id : null,
      authAt: timestamps.length ? Math.min(...timestamps) : null,
    };
  } catch {
    return empty;
  }
}

/** Cookie value is `<session_id>.<epoch seconds>` so a new sign-in starts fresh. */
export function parseLastSeen(
  value: string | null | undefined,
  sessionId: string | null,
): number | null {
  if (!value || !sessionId) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0 || value.slice(0, dot) !== sessionId) return null;
  const seen = Number(value.slice(dot + 1));
  return Number.isFinite(seen) && seen > 0 ? seen : null;
}

export function formatLastSeen(sessionId: string, now: number): string {
  return `${sessionId}.${Math.floor(now)}`;
}

export type SessionExpiry = "idle" | "max_age" | null;

export function sessionExpiry({
  kind,
  authAt,
  lastSeen,
  now,
}: {
  kind: SessionPolicyKind;
  authAt: number | null;
  lastSeen: number | null;
  now: number;
}): SessionExpiry {
  const policy = SESSION_POLICY[kind];
  if (authAt !== null && now - authAt > policy.maxSeconds) return "max_age";
  if (lastSeen !== null && now - lastSeen > policy.idleSeconds) return "idle";
  return null;
}
