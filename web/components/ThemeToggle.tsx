"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  THEME_STORAGE_KEY,
  getPreferredTheme,
  persistTheme,
  type Theme,
} from "@/lib/theme";

const THEME_CHANGE_EVENT = "spm-theme-change";

function subscribeTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function getThemeSnapshot(): Theme {
  return getPreferredTheme();
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

function chooseTheme(next: Theme) {
  persistTheme(next);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

type Props = {
  /** `settings` = labeled segment control; `icon` = compact header button. */
  variant?: "settings" | "icon";
  className?: string;
};

/** Appearance control. Settings uses the segment; marketing uses the icon. */
export function ThemeToggle({ variant = "settings", className }: Props) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  if (variant === "icon") {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const label =
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

    return (
      <button
        type="button"
        className={["theme-toggle-icon", className].filter(Boolean).join(" ")}
        aria-label={label}
        title={label}
        onClick={() => chooseTheme(next)}
      >
        {theme === "dark" ? (
          <Sun size={18} aria-hidden />
        ) : (
          <Moon size={18} aria-hidden />
        )}
      </button>
    );
  }

  return (
    <div className={["settings-theme-row", className].filter(Boolean).join(" ")}>
      <div>
        <span className="settings-pref-title">Appearance</span>
        <span className="settings-pref-desc">
          Use a light or dark interface. Saved on this device.
        </span>
      </div>
      <div className="theme-segment" role="group" aria-label="Appearance">
        <button
          type="button"
          className="theme-segment-btn"
          data-active={theme === "light"}
          onClick={() => chooseTheme("light")}
        >
          Light
        </button>
        <button
          type="button"
          className="theme-segment-btn"
          data-active={theme === "dark"}
          onClick={() => chooseTheme("dark")}
        >
          Dark
        </button>
      </div>
    </div>
  );
}
