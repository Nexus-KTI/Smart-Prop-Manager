"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ForgotPasswordModalProps = {
  open: boolean;
  initialEmail?: string;
  onClose: () => void;
};

export function ForgotPasswordModal({
  open,
  initialEmail = "",
  onClose,
}: ForgotPasswordModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(initialEmail);
    setError(null);
    setSent(false);
    setPending(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, initialEmail]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const trimmed = email.trim();
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
      setError(resetError.message);
      return;
    }

    setSent(true);
  }

  return (
    <div
      className="auth-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="auth-modal-header">
          <h2 id={titleId} className="auth-modal-title">
            Reset password
          </h2>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {sent ? (
          <div className="auth-modal-body">
            <p className="form-help" style={{ margin: 0 }}>
              If an account exists for <strong>{email.trim()}</strong>, we sent
              a reset link. Check your inbox and spam folder.
            </p>
            <div className="form-actions auth-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={onClose}
              >
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
          <form className="auth-modal-body" onSubmit={onSubmit}>
            <p className="form-help" style={{ margin: 0 }}>
              Enter your email and we&apos;ll send a link to choose a new
              password.
            </p>

            {error ? <p className="form-error">{error}</p> : null}

            <label className="form-field">
              <span className="form-label">Email</span>
              <input
                ref={inputRef}
                className="form-input"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <div className="form-actions-split">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={pending}
              >
                {pending ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
