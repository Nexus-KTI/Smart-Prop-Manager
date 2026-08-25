"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function formatResetRequestError(message: string | undefined): string {
  const raw = (message || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Could not send reset link.";
  if (raw === "Failed to fetch" || lower.includes("networkerror")) {
    return "Can't reach Supabase. Check your connection and try again.";
  }
  if (lower.includes("rate") || lower.includes("too many")) {
    return "Too many reset attempts. Wait a minute, then try again.";
  }
  if (lower.includes("redirect") || lower.includes("url")) {
    return "Reset link redirect isn’t configured. Ask your admin to allow /auth/callback in Supabase.";
  }
  return raw;
}

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const initialEmail = (searchParams.get("email") ?? "").trim();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setPending(false);
      setError("Enter the email for your account.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`;
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      trimmed,
      { redirectTo },
    );

    setPending(false);

    if (resetError) {
      setError(formatResetRequestError(resetError.message));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="form-card auth-card">
        <p className="form-success" style={{ marginTop: 0 }}>
          Check your inbox
        </p>
        <p className="form-help">
          If an account exists for <strong>{email.trim()}</strong>, we sent a
          link to set a new password. It expires soon. Open it on this device,
          then choose a password of at least 8 characters.
        </p>
        <div className="form-actions auth-actions">
          <Link href="/login" className="btn-primary">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="form-card auth-card" onSubmit={onSubmit}>
      {error ? <p className="form-error">{error}</p> : null}

      <label className="form-field">
        <span className="form-label">Email</span>
        <input
          className="form-input"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          disabled={pending}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Enter your email"
        />
      </label>

      <div className="form-actions auth-actions">
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Reset password"}
        </button>
      </div>

      <p className="auth-switch">
        Remembered it?{" "}
        <Link href="/login" className="auth-alt-link">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
