export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "spm-theme";
export const THEME_CHANGE_EVENT = "spm-theme-change";

/** Logged-in shells default to dark until the user picks a theme; marketing/auth stay light. */
export const APP_ROUTE_PREFIXES = [
  "/dashboard",
  "/properties",
  "/tenancies",
  "/payments",
  "/reminders",
  "/messages",
  "/applications",
  "/work-orders",
  "/expenses",
  "/reports",
  "/tasks",
  "/publications",
  "/access",
  "/settings",
  "/portfolios",
  "/ops",
  "/onboarding",
  "/tenant",
  "/artisan",
  "/admin",
] as const;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function defaultThemeFor(pathname: string): Theme {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function persistTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / private mode failures; attribute still applied.
  }
}

export function getPreferredTheme(pathname?: string): Theme {
  const path =
    pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname);
  return readStoredTheme() ?? defaultThemeFor(path);
}
