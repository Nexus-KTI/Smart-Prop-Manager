/**
 * Short-lived GET cache for shell reads (badges, profile, Action needed).
 * Callers that mount together share one request; a body stays fresh for TTL_MS.
 * Any successful write through apiFetch calls clearApiCache().
 */

export const API_CACHE_TTL_MS = 20_000;
const MAX_ENTRIES = 100;

type Entry = { at: number; status: number; body: string };

const settled = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
let generation = 0;

function toResponse(entry: Entry): Response {
  const nullBody = entry.status === 204 || entry.status === 304;
  return new Response(nullBody ? null : entry.body, {
    status: entry.status,
    headers: { "Content-Type": "application/json" },
  });
}

function prune(now: number): void {
  if (settled.size < MAX_ENTRIES) return;
  for (const [key, entry] of settled) {
    if (now - entry.at >= API_CACHE_TTL_MS) settled.delete(key);
  }
  while (settled.size >= MAX_ENTRIES) {
    const oldest = settled.keys().next().value;
    if (oldest === undefined) break;
    settled.delete(oldest);
  }
}

export async function cachedResponse(
  key: string,
  load: () => Promise<Response>,
  fresh = false,
): Promise<Response> {
  if (!fresh) {
    const hit = settled.get(key);
    if (hit && Date.now() - hit.at < API_CACHE_TTL_MS) return toResponse(hit);
    const pending = inflight.get(key);
    if (pending) return toResponse(await pending);
  }

  const startedIn = generation;
  const request = (async () => {
    const res = await load();
    const entry: Entry = { at: Date.now(), status: res.status, body: await res.text() };
    // A write that landed mid-flight may have changed this read; don't keep it.
    if (res.ok && startedIn === generation) {
      prune(entry.at);
      settled.set(key, entry);
    }
    return entry;
  })();

  inflight.set(key, request);
  try {
    return toResponse(await request);
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}

export function clearApiCache(): void {
  generation += 1;
  settled.clear();
  inflight.clear();
}
