/** Active owner portfolio for staff multi-owner switching (F41). */

const STORAGE_KEY = "nexora-portfolio-owner-id";

export function readPortfolioOwnerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writePortfolioOwnerId(ownerId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!ownerId) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, ownerId);
    }
    window.dispatchEvent(new Event("nexora-portfolio-change"));
  } catch {
    /* private mode */
  }
}
