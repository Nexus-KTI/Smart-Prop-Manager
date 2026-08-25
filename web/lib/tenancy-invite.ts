/** Extract a tenancy claim token from a raw paste (token or full claim URL). */
export function normalizeTenancyClaimToken(raw: string): string {
  const value = (raw || "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const fromQuery = (url.searchParams.get("token") || "").trim();
    if (fromQuery) return fromQuery;
  } catch {
    /* not a full URL */
  }

  const pathMatch = value.match(/[?&]token=([^&\s#]+)/i);
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]).trim();
    } catch {
      return pathMatch[1].trim();
    }
  }

  return value;
}
