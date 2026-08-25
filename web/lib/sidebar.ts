/** Persisted rail width toggle, CSS reads html[data-sidebar-collapsed="true"] (64px). */
export const SIDEBAR_STORAGE_KEY = "spm-sidebar-collapsed";

export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function applySidebarCollapsed(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(
    "data-sidebar-collapsed",
    collapsed ? "true" : "false",
  );
}

export function persistSidebarCollapsed(collapsed: boolean): void {
  applySidebarCollapsed(collapsed);
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore quota / private mode failures.
  }
}
