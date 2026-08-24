"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (userError || !user) {
        setError(
          "This reset link is invalid or has expired. Request a new one from the sign-in page.",
        );
        setReady(true);
        return;
      }

      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  async function onSuccess() {
    let nextPath = "/onboarding";
    try {
      const { fetchAdminMe, fetchPropertiesPage } = await import("@/lib/api");
      const me = await fetchAdminMe();
      if (me.is_admin) {
        nextPath = "/admin/leads";
      } else {
        const page = await fetchPropertiesPage();
        if (page.items.length > 0) nextPath = "/properties";
      }
    } catch {
      /* fall through to onboarding */
    }
    router.replace(nextPath);
    router.refresh();
  }

  if (!ready) {
    return (
      <div className="form-card auth-card">
        <p className="form-help">Checking reset link…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="form-card auth-card">
        <p className="form-error">{error}</p>
        <div className="form-actions auth-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => router.replace("/login")}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-card auth-card">
      <ChangePasswordForm
        className="settings-inline-form"
        onSuccess={() => void onSuccess()}
      />
    </div>
  );
}
