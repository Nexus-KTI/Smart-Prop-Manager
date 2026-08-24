"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fetchMe } from "@/lib/api";

type UserMenuProfile = {
  displayName: string;
  initials: string;
  loading: boolean;
};

const UserMenuProfileContext = createContext<UserMenuProfile | null>(null);

function initialsFrom(source: string): string {
  const parts = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "SP";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function UserMenuProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserMenuProfile>({
    displayName: "",
    initials: "",
    loading: true,
  });
  const loadSeq = useRef(0);

  useEffect(() => {
    const seq = ++loadSeq.current;
    setProfile((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const me = await fetchMe();
        if (seq !== loadSeq.current) return;
        const label = (me.business_name || me.name || "").trim();
        setProfile({
          displayName: label || "Account",
          initials: initialsFrom(label || me.name || "SP"),
          loading: false,
        });
      } catch {
        if (seq !== loadSeq.current) return;
        setProfile({
          displayName: "Account",
          initials: "SP",
          loading: false,
        });
      }
    })();
  }, []);

  return (
    <UserMenuProfileContext.Provider value={profile}>
      {children}
    </UserMenuProfileContext.Provider>
  );
}

function useUserMenuProfile(): UserMenuProfile {
  const ctx = useContext(UserMenuProfileContext);
  if (!ctx) {
    throw new Error("UserMenu must be used within UserMenuProvider");
  }
  return ctx;
}

export function UserMenu() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { displayName, initials, loading } = useUserMenuProfile();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={loading ? "Loading account" : displayName}
        aria-busy={loading || undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        {loading ? (
          <span className="skeleton-circle" aria-hidden="true" />
        ) : (
          <span className="user-menu-avatar" aria-hidden="true">
            {initials}
          </span>
        )}
        <span className="user-menu-name">
          {loading ? (
            <span className="skeleton-bar" style={{ width: 72 }} aria-hidden />
          ) : (
            displayName
          )}
        </span>
      </button>

      {open ? (
        <div className="user-menu-dropdown" id={menuId} role="menu">
          {/* Account/settings entry lives in the sidebar nav only — no duplicate here. */}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="user-menu-item user-menu-item-button"
              role="menuitem"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
