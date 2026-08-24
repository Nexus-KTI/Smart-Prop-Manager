"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type ChangePasswordFormProps = {
  /** Defaults to `.form-card` for standalone auth panels. */
  className?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function ChangePasswordForm({
  className = "form-card",
  onSuccess,
  onCancel,
}: ChangePasswordFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    if (newPassword.length < 6) {
      setPending(false);
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPending(false);
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    onSuccess?.();
  }

  return (
    <form className={className} onSubmit={onSubmit}>
      {error ? <p className="form-error">{error}</p> : null}

      <label className="form-field">
        <span className="form-label">New password</span>
        <input
          className="form-input"
          name="new_password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={newPassword}
          disabled={pending}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="At least 6 characters"
        />
      </label>

      <label className="form-field">
        <span className="form-label">Confirm password</span>
        <input
          className="form-input"
          name="confirm_password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirmPassword}
          disabled={pending}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat password"
        />
      </label>

      <div
        className={
          onCancel
            ? "form-actions form-actions-split"
            : "form-actions auth-actions"
        }
      >
        {onCancel ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        ) : null}
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </button>
      </div>
    </form>
  );
}
