"use client";

import { useEffect, useState } from "react";

import {
  getPreferredTheme,
  persistTheme,
  type Theme,
} from "@/lib/theme";

/** Single Appearance control, used on Settings → Profile only. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(getPreferredTheme());
    setReady(true);
  }, []);

  function setAndPersist(next: Theme) {
    setTheme(next);
    persistTheme(next);
  }

  return (
    <div className="settings-theme-row">
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
          onClick={() => setAndPersist("light")}
          disabled={!ready}
        >
          Light
        </button>
        <button
          type="button"
          className="theme-segment-btn"
          data-active={theme === "dark"}
          onClick={() => setAndPersist("dark")}
          disabled={!ready}
        >
          Dark
        </button>
      </div>
    </div>
  );
}
