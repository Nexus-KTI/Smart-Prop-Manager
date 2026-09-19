"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import {
  AuthCaptcha,
  requireCaptchaToken,
} from "@/components/auth/AuthCaptcha";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { formatEmailLoginError } from "@/lib/auth-errors";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import { getPendingMfaFactorId, verifyMfaCode } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/client";

type Mode = "phone" | "email";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("phone");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [booting, setBooting] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback") {
      setMode("email");
      setError("That reset link is invalid or expired. Request a new one.");
    }
    if (searchParams.get("mfa") === "1") {
      setMode("email");
      void (async () => {
        const factorId = await getPendingMfaFactorId();
        if (factorId) setMfaFactorId(factorId);
      })();
    }
  }, [searchParams]);

  function selectMode(next: Mode) {
    setMode(next);
    setError(null);
    setMfaFactorId(null);
    setMfaCode("");
  }

  async function continueAfterAuth() {
    setBooting(true);
    await redirectAfterAuth(router);
  }

  async function maybeChallengeMfa(): Promise<boolean> {
    const factorId = await getPendingMfaFactorId();
    if (!factorId) return false;
    setMfaFactorId(factorId);
    return true;
  }

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const nextEmail = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    setEmail(nextEmail);

    const supabase = createClient();
    let captcha: string | null = null;
    try {
      captcha = requireCaptchaToken(captchaToken);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Complete the captcha.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: nextEmail,
      password,
      options: captcha ? { captchaToken: captcha } : undefined,
    });
    setCaptchaToken(null);

    if (signInError) {
      setPending(false);
      setError(formatEmailLoginError(signInError.message));
      return;
    }

    try {
      const needsMfa = await maybeChallengeMfa();
      setPending(false);
      if (needsMfa) return;
      await continueAfterAuth();
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Could not finish sign-in");
    }
  }

  async function onMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaFactorId) return;
    setError(null);
    setPending(true);
    try {
      await verifyMfaCode(mfaFactorId, mfaCode);
      setPending(false);
      await continueAfterAuth();
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Invalid authentication code");
    }
  }

  if (booting) {
    return <AuthLoadingGate label="Signing you in…" />;
  }

  const forgotHref = email.trim()
    ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
    : "/forgot-password";

  if (mfaFactorId) {
    return (
      <div className="form-card auth-card">
        <form className="auth-tab-panel" onSubmit={(e) => void onMfaSubmit(e)}>
          <p className="form-hint">
            Enter the 6-digit code from your authenticator app.
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          <label className="form-field">
            <span className="form-label">Authentication code</span>
            <input
              className="form-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              disabled={pending}
            />
          </label>
          <div className="form-actions auth-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => {
                setMfaFactorId(null);
                setMfaCode("");
                void createClient().auth.signOut();
              }}
            >
              Back
            </button>
            <button className="btn-primary" type="submit" disabled={pending}>
              {pending ? "Verifying…" : "Verify and sign in"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="form-card auth-card">
      <div className="auth-tabs" role="tablist" aria-label="Sign in method">
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
          key="login-phone"
          purpose="signin"
          className="auth-tab-panel"
          verifyLabel="Verify and sign in"
          onSuccess={() => void continueAfterAuth()}
        />
      ) : null}

      {mode === "email" ? (
        <form className="auth-tab-panel" onSubmit={onEmailSubmit}>
          {error ? (
            <p className="form-error">
              {error}{" "}
              {searchParams.get("error") === "auth_callback" ? (
                <Link href={forgotHref} className="auth-alt-link">
                  Reset password
                </Link>
              ) : null}
            </p>
          ) : null}

          <label className="form-field">
            <span className="form-label">Email</span>
            <input
              className="form-input"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="form-field">
            <div className="form-label-row">
              <span className="form-label">Password</span>
              <Link href={forgotHref} className="auth-alt-link">
                Forgot password?
              </Link>
            </div>
            <input
              className="form-input"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </label>

          <AuthCaptcha onToken={setCaptchaToken} />

          <div className="form-actions auth-actions">
            <button className="btn-primary" type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      ) : null}

      <p className="auth-switch">
        No account?{" "}
        <Link href="/signup" className="auth-alt-link">
          Create one
        </Link>
      </p>
    </div>
  );
}
