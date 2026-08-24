import { Suspense } from "react";

import { LoginForm } from "@/components/LoginForm";
import { authOtpChannelLabel } from "@/lib/auth-otp-channel";
import { BRAND_NAME } from "@/lib/brand";

export default function LoginPage() {
  const otpChannel = authOtpChannelLabel();

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <header className="auth-header">
          <p className="auth-brand">{BRAND_NAME}</p>
          <h1 className="page-title">Sign in</h1>
          <p className="page-subtitle">
            Sign in with {otpChannel} or email to access your properties.
          </p>
        </header>
        <Suspense fallback={<div className="form-card auth-card">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </section>
  );
}
