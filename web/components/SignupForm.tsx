"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { createClient } from "@/lib/supabase/client";

type Mode = "phone" | "email";

const INVITE_ONLY =
  process.env.NEXT_PUBLIC_INVITE_ONLY_SIGNUP === "true" ||
  process.env.NEXT_PUBLIC_INVITE_ONLY_SIGNUP === "1";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get("email") ?? "";
  const inviteName = searchParams.get("name") ?? "";
  const inviteWhatsapp = searchParams.get("whatsapp") ?? "";
  const inviteToken = (searchParams.get("invite") ?? "").trim();
  const hasInvite = Boolean(inviteToken);

  const [mode, setMode] = useState<Mode>("phone");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (INVITE_ONLY && !hasInvite) {
    return (
      <div className="form-card auth-card">
        <p className="form-error">
          Nexora is invite-only right now. Request access on the home page
          — we’ll text you a signup link when you’re approved.
        </p>
        <p className="form-hint">
          Already received an invite? Open the link from your SMS (it includes
          a one-time invite code). Don’t use this page URL alone.
        </p>
        <div className="form-actions auth-actions">
          <Link href="/#get-started" className="btn-primary">
            Request access
          </Link>
        </div>
        <p className="auth-switch">
          Already have an account?{" "}
          <Link href="/login" className="auth-alt-link">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  async function onPhoneSuccess() {
    router.replace("/onboarding");
    router.refresh();
  }

  function selectMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    setPending(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    setInfo("Account created. Check your email to confirm, then sign in.");
  }

  return (
    <div className="form-card auth-card">
      {hasInvite ? (
        <p className="form-success" role="status">
          {inviteName.trim()
            ? `Welcome, ${inviteName.trim()}. Finish creating your landlord account.`
            : "You’re invited. Finish creating your landlord account."}
        </p>
      ) : null}

      <div className="auth-tabs" role="tablist" aria-label="Sign up method">
        <button
          type="button"
          role="tab"
          className="auth-tab"
          aria-selected={mode === "phone"}
          onClick={() => selectMode("phone")}
        >
          Phone
        </button>
        <button
          type="button"
          role="tab"
          className="auth-tab"
          aria-selected={mode === "email"}
          onClick={() => selectMode("email")}
        >
          Email
        </button>
      </div>

      {mode === "phone" ? (
        <PhoneOtpFlow
          key={`signup-phone-${inviteWhatsapp}`}
          purpose="signup"
          showName
          initialName={inviteName}
          initialPhone={inviteWhatsapp}
          className="auth-tab-panel"
          verifyLabel="Verify and continue"
          onSuccess={onPhoneSuccess}
        />
      ) : null}

      {mode === "email" ? (
        <form className="auth-tab-panel" onSubmit={onEmailSubmit}>
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
              placeholder="you@example.com"
              defaultValue={defaultEmail}
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
              placeholder="At least 6 characters"
            />
          </label>

          <div className="form-actions auth-actions">
            <button className="btn-primary" type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      ) : null}

      <p className="auth-switch">
        Already have an account?{" "}
        <Link href="/login" className="auth-alt-link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
