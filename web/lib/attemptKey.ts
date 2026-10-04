import { ApiRequestError } from "@/lib/api";

/**
 * True when the server may still have applied the request (network error, timeout,
 * 5xx, or "already processing"), so a retry must reuse the same Idempotency-Key.
 */
export function keepAttemptKey(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) return true;
  if (err.status >= 500) return true;
  return err.status === 409 && /already processing/i.test(err.message);
}

/**
 * One Idempotency-Key per user action. `for(signature)` returns the same key while the
 * action (e.g. unit + message) is unchanged; `settle(err)` drops it once the outcome is known.
 */
export class AttemptKey {
  private current: { signature: string; key: string } | null = null;

  for(signature: string): string {
    if (this.current?.signature !== signature) {
      this.current = { signature, key: crypto.randomUUID() };
    }
    return this.current.key;
  }

  settle(err?: unknown): void {
    if (err === undefined || !keepAttemptKey(err)) this.current = null;
  }
}
