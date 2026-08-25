"use client";

import Link from "next/link";
import { Camera, LogOut, Settings } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fetchMe, uploadMyAvatar } from "@/lib/api";

type UserMenuProfile = {
  displayName: string;
  initials: string;
  email: string | null;
  roleLabel: string;
  avatarUrl: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setFromUpload: (avatarUrl: string | null, displayName?: string) => void;
};

const UserMenuProfileContext = createContext<UserMenuProfile | null>(null);

function initialsFrom(source: string): string {
  const parts = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "N";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function roleLabelFrom(role: string | undefined): string {
  const r = (role || "landlord").toLowerCase();
  if (r === "tenant") return "Tenant";
  if (r === "artisan") return "Artisan";
  if (r === "staff" || r === "manager") return "Staff";
  return "Landlord";
}

export function UserMenuProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Omit<UserMenuProfile, "refresh" | "setFromUpload">>({
    displayName: "",
    initials: "",
    email: null,
    roleLabel: "Landlord",
    avatarUrl: null,
    loading: true,
  });
  const loadSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    setProfile((prev) => ({ ...prev, loading: true }));
    try {
      const me = await fetchMe();
      if (seq !== loadSeq.current) return;
      const label = (me.business_name || me.name || "").trim();
      setProfile({
        displayName: label || "Account",
        initials: initialsFrom(label || me.name || "N"),
        email: me.email,
        roleLabel: roleLabelFrom(me.role),
        avatarUrl: me.avatar_url || null,
        loading: false,
      });
    } catch {
      if (seq !== loadSeq.current) return;
      setProfile({
        displayName: "Account",
        initials: "N",
        email: null,
        roleLabel: "Account",
        avatarUrl: null,
        loading: false,
      });
    }
  }, []);

  const setFromUpload = useCallback(
    (avatarUrl: string | null, displayName?: string) => {
      setProfile((prev) => ({
        ...prev,
        avatarUrl,
        displayName: displayName?.trim() || prev.displayName,
        initials: initialsFrom(displayName?.trim() || prev.displayName || "N"),
      }));
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value: UserMenuProfile = {
    ...profile,
    refresh,
    setFromUpload,
  };

  return (
    <UserMenuProfileContext.Provider value={value}>
      {children}
    </UserMenuProfileContext.Provider>
  );
}

export function useUserMenuProfile(): UserMenuProfile {
  const ctx = useContext(UserMenuProfileContext);
  if (!ctx) {
    throw new Error("UserMenu must be used within UserMenuProvider");
  }
  return ctx;
}

/** Safe when Settings is rendered outside shells (rare). */
export function useOptionalUserMenuProfile(): UserMenuProfile | null {
  return useContext(UserMenuProfileContext);
}

function AvatarFace({
  initials,
  avatarUrl,
  sizeClass,
}: {
  initials: string;
  avatarUrl: string | null;
  sizeClass: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`user-menu-avatar-img ${sizeClass}`}
      />
    );
  }
  return (
    <span className={`user-menu-avatar ${sizeClass}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function UserMenu({
  settingsHref = "/settings",
}: {
  settingsHref?: string;
}) {
  const menuId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const {
    displayName,
    initials,
    email,
    roleLabel,
    avatarUrl,
    loading,
    setFromUpload,
  } = useUserMenuProfile();

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

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const me = await uploadMyAvatar(file);
      setFromUpload(me.avatar_url || null, me.business_name || me.name);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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
          <AvatarFace
            initials={initials}
            avatarUrl={avatarUrl}
            sizeClass="user-menu-avatar-sm"
          />
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
          <div className="user-menu-identity">
            <div className="user-menu-avatar-wrap">
              <AvatarFace
                initials={initials}
                avatarUrl={avatarUrl}
                sizeClass="user-menu-avatar-lg"
              />
              <button
                type="button"
                className="user-menu-avatar-edit"
                aria-label="Upload profile photo"
                title="Upload photo"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={14} strokeWidth={2} aria-hidden />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
            </div>
            <div className="user-menu-identity-text">
              <p className="user-menu-role">{roleLabel}</p>
              <p className="user-menu-fullname">{displayName}</p>
              {email ? <p className="user-menu-email">{email}</p> : null}
              {uploading ? (
                <p className="user-menu-upload-status">Uploading…</p>
              ) : null}
              {uploadError ? (
                <p className="user-menu-upload-error" role="alert">
                  {uploadError}
                </p>
              ) : null}
            </div>
          </div>

          <Link
            href={settingsHref}
            className="user-menu-settings-btn"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Settings size={16} strokeWidth={1.75} aria-hidden />
            Settings
          </Link>

          <div className="user-menu-divider" />

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="user-menu-item user-menu-item-button user-menu-item-row"
              role="menuitem"
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
