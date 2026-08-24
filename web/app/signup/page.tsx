import { Suspense } from "react";

import { SignupForm } from "@/components/SignupForm";
import { authOtpChannelLabel } from "@/lib/auth-otp-channel";
import { BRAND_NAME } from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

export default function SignupPage() {
  const otpChannel = authOtpChannelLabel();
  const inviteOnly = inviteOnlySignup();

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <header className="auth-header">
          <p className="auth-brand">{BRAND_NAME}</p>
          <h1 className="page-title">Create account</h1>
          <p className="page-subtitle">
            {inviteOnly
              ? `Invite-only closed beta. Use the link from your access invite, then verify with ${otpChannel} or email.`
              : `Create a free landlord account. Verify with ${otpChannel} or email.`}
          </p>
        </header>
        <Suspense fallback={<div className="form-card auth-card">Loading…</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </section>
  );
}
