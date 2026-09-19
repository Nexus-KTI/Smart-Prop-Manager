import { Suspense } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { LoginForm } from "@/components/LoginForm";
import { authOtpChannelLabel } from "@/lib/auth-otp-channel";
import { BRAND_NAME, BRAND_STAMP } from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

export default function LoginPage() {
  const otpChannel = authOtpChannelLabel();
  const inviteOnly = inviteOnlySignup();

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <header className="auth-header">
          <p className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">
              <BrandMark size={22} />
            </span>
            <span className="auth-brand-text">
              {BRAND_NAME}{" "}
              <span className="marketing-brand-stamp">{BRAND_STAMP}</span>
            </span>
          </p>
          <h1 className="page-title">Log in</h1>
          <p className="page-subtitle">
            Landlords, tenants, staff, and artisans, sign in with {otpChannel}{" "}
            or email.
          </p>
        </header>
        <Suspense
          fallback={<AuthLoadingGate variant="panel" label="Loading…" />}
        >
          <LoginForm />
        </Suspense>
        <p className="auth-footer-links">
          <Link href="/">← Back to home</Link>
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
