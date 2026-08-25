"use client";

import { FormEvent, useState } from "react";

import { PasswordFields } from "@/components/auth/PasswordFields";
import {
  formatPasswordAuthError,
  validatePasswordPair,
} from "@/lib/password";
import { createClient } from "@/lib/supabase/client";

type ChangePasswordFormProps = {
  /** Defaults to `.form-card` for standalone auth panels. */
  className?: string;
  /** Reset-link flow vs settings change. */
  variant?: "change" | "reset";
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function ChangePasswordForm({
  className = "form-card",
  variant = "change",
  onSuccess,
  onCancel,
}: ChangePasswordFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isReset = variant === "reset";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const check = validatePasswordPair(newPassword, confirmPassword);
    if (!check.ok) {
      setPending(false);
      setError(check.message);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setPending(false);

    if (updateError) {
      setError(formatPasswordAuthError(updateError.message));
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    onSuccess?.();
  }

  return (
    <form className={className} onSubmit={onSubmit}>
      {error ? <p className="form-error">{error}</p> : null}

      <PasswordFields
        password={newPassword}
        confirm={confirmPassword}
        onPasswordChange={setNewPassword}
        onConfirmChange={setConfirmPassword}
        disabled={pending}
        passwordLabel={isReset ? "New password" : "New password"}
        confirmLabel="Confirm password"
      />

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
          {pending
            ? isReset
              ? "Saving…"
              : "Updating…"
            : isReset
              ? "Save new password"
              : "Update password"}
        </button>
      </div>
    </form>
  );
}
