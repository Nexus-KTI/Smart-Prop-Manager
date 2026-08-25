"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { uploadMyAvatar } from "@/lib/api";
import { useOptionalUserMenuProfile } from "@/components/UserMenu";

function initialsFrom(source: string): string {
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "N";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

/** Settings-page avatar with camera upload (syncs header menu). */
export function ProfileAvatarEditor({
  name,
  avatarUrl,
  onUploaded,
}: {
  name: string;
  avatarUrl: string | null;
  onUploaded?: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(avatarUrl);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menu = useOptionalUserMenuProfile();
  const initials = initialsFrom(name || "N");

  useEffect(() => {
    setUrl(avatarUrl);
  }, [avatarUrl]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const me = await uploadMyAvatar(file);
      const next = me.avatar_url || null;
      setUrl(next);
      onUploaded?.(next);
      menu?.setFromUpload(next, me.business_name || me.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="profile-avatar-editor">
      <div className="user-menu-avatar-wrap">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="user-menu-avatar-img user-menu-avatar-lg"
          />
        ) : (
          <span className="user-menu-avatar user-menu-avatar-lg" aria-hidden>
            {initials}
          </span>
        )}
        <button
          type="button"
          className="user-menu-avatar-edit"
          aria-label="Upload profile photo"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          <Camera size={14} strokeWidth={2} aria-hidden />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </div>
      <div>
        <p className="form-label" style={{ margin: 0 }}>
          Profile photo
        </p>
        <p className="form-help" style={{ margin: "4px 0 0" }}>
          JPEG, PNG, or WebP · max 2 MB
          {pending ? " · Uploading…" : ""}
        </p>
        {error ? (
          <p className="form-error" style={{ marginTop: 6 }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
