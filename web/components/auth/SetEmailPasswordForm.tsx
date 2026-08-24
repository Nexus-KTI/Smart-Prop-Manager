"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type SetEmailPasswordFormProps = {
  className?: string;
  initialEmail?: string;
  onSuccess?: () => void;
};

export function SetEmailPasswordForm({
  className,
  initialEmail = "",
  onSuccess,
}: SetEmailPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setPending(false);
      setError("Email is required.");
      return;
    }
    if (password.length < 6) {
      setPending(false);
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setPending(false);
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      email: trimmedEmail,
      password,
    });

    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setInfo(
      "Email sign-in enabled. If Supabase asks you to confirm your email, check your inbox before signing in with email.",
    );
    onSuccess?.();
  }

  return (
    <form className={className} onSubmit={onSubmit}>
      {error ? <p className="form-error">{error}</p> : null}
      {info ? <p className="form-success">{info}</p> : null}

      <label className="form-field">
        <span className="form-label">Email</span>
        <input
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

      <label className="form-field">
        <span className="form-label">Password</span>
        <input
          className="form-input"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          disabled={pending}
          onChange={(event) => setPassword(event.target.value)}
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

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Enable email sign-in"}
        </button>
      </div>
    </form>
  );
}
