"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { THEME_CHANGE_EVENT, applyTheme, getPreferredTheme } from "@/lib/theme";

/** Re-applies the route default on client navigation (boot script covers first paint). */
export function ThemeRouteSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(getPreferredTheme(pathname));
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, [pathname]);
  return null;
}
