import { Suspense } from "react";
import Link from "next/link";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { BRAND_NAME, BRAND_STAMP } from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

export default function ForgotPasswordPage() {
  const inviteOnly = inviteOnlySignup();

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <header className="auth-header">
          <p className="auth-brand">
            {BRAND_NAME}{" "}
            <span className="marketing-brand-stamp">{BRAND_STAMP}</span>
          </p>
          <h1 className="page-title">Reset password</h1>
          <p className="page-subtitle">
            Enter the email address associated with your account to get
            instructions.
          </p>
        </header>
        <Suspense
          fallback={<AuthLoadingGate variant="panel" label="Loading…" />}
        >
          <ForgotPasswordForm />
        </Suspense>
        <p className="auth-footer-links">
          <Link href="/login">← Back to sign in</Link>
          {" · "}
          {inviteOnly ? (
            <Link href="/#get-started">Request access</Link>
          ) : (
            <Link href="/signup">Create account</Link>
          )}
        </p>
      </div>
    </section>
  );
}
