"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function resolveSession() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (user && !userError) {
        setHasSession(true);
        setError(null);
        setReady(true);
        return;
      }

      // Hash / PKCE client recovery can land a moment after mount.
      window.setTimeout(async () => {
        if (!active) return;
        const {
          data: { user: retryUser },
        } = await supabase.auth.getUser();
        if (!active) return;
        if (retryUser) {
          setHasSession(true);
          setError(null);
        } else {
          setHasSession(false);
          setError(
            "This reset link is invalid or has expired. Request a new one.",
          );
        }
        setReady(true);
      }, 600);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (
        event === "PASSWORD_RECOVERY" ||
        (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION"))
      ) {
        setHasSession(true);
        setError(null);
        setReady(true);
      }
    });

    void resolveSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function onSuccess() {
    setBooting(true);
    await redirectAfterAuth(router);
  }

  if (!ready) {
    return (
      <AuthLoadingGate variant="panel" label="Checking reset link…" />
    );
  }

  if (booting) {
    return <AuthLoadingGate label="Signing you in…" />;
  }

  if (!hasSession || error) {
    return (
      <div className="form-card auth-card">
        <p className="form-error">
          {error ||
            "This reset link is invalid or has expired. Request a new one."}
        </p>
        <div className="form-actions auth-actions">
          <Link href="/forgot-password" className="btn-primary">
            Reset password
          </Link>
        </div>
        <p className="auth-switch">
          <Link href="/login" className="auth-alt-link">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="form-card auth-card">
      <p className="form-help" style={{ marginTop: 0 }}>
        Choose a new password for email sign-in. You’ll use this the next time
        you sign in with email.
      </p>
      <ChangePasswordForm
        className="settings-inline-form"
        variant="reset"
        onSuccess={() => void onSuccess()}
      />
    </div>
  );
}
