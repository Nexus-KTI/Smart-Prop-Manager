"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { ForgotPasswordModal } from "@/components/auth/ForgotPasswordModal";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { createClient } from "@/lib/supabase/client";

type Mode = "phone" | "email";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("phone");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "auth_callback") {
      setMode("email");
      setError("That reset link is invalid or expired. Request a new one.");
    }
  }, [searchParams]);

  async function redirectAfterLogin() {
    let nextPath = "/onboarding";
    try {
      const { fetchAdminMe, fetchMe, fetchPropertiesPage } = await import(
        "@/lib/api"
      );
      const profile = await fetchMe();
      if (profile.role === "tenant") {
        nextPath = "/tenant";
      } else {
        const me = await fetchAdminMe();
        if (me.is_admin) {
          nextPath = "/admin/leads";
        } else {
          const page = await fetchPropertiesPage();
          if (page.items.length > 0) nextPath = "/properties";
        }
      }
    } catch {
      /* new landlords without API access land on onboarding */
    }

    router.replace(nextPath);
    router.refresh();
  }

  function selectMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const nextEmail = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setEmail(nextEmail);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: nextEmail,
      password,
    });

    if (signInError) {
      setPending(false);
      setError(signInError.message);
      return;
    }

    await redirectAfterLogin();
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
          onSuccess={redirectAfterLogin}
        />
      ) : null}

      {mode === "email" ? (
        <form className="auth-tab-panel" onSubmit={onEmailSubmit}>
          {error ? <p className="form-error">{error}</p> : null}

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
              <button
                type="button"
                className="auth-alt-link"
                onClick={() => setForgotOpen(true)}
              >
                Forgot password?
              </button>
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

      <ForgotPasswordModal
        open={forgotOpen}
        initialEmail={email}
        onClose={() => setForgotOpen(false)}
      />
    </div>
  );
}
