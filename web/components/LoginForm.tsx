"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { formatEmailLoginError } from "@/lib/auth-errors";
import { redirectAfterAuth } from "@/lib/auth-redirect";
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

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback") {
      setMode("email");
      setError("That reset link is invalid or expired. Request a new one.");
    }
  }, [searchParams]);

  function selectMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function continueAfterAuth() {
    setBooting(true);
    await redirectAfterAuth(router);
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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: nextEmail,
      password,
    });

    if (signInError) {
      setPending(false);
      setError(formatEmailLoginError(signInError.message));
      return;
    }

    setPending(false);
    await continueAfterAuth();
  }

  if (booting) {
    return <AuthLoadingGate label="Signing you in…" />;
  }

  const forgotHref = email.trim()
    ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
    : "/forgot-password";

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
