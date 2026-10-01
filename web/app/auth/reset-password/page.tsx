import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { BrandMark, BrandStamp } from "@/components/BrandMark";
import { BRAND_NAME } from "@/lib/brand";

export default function ResetPasswordPage() {
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
              <BrandStamp className="marketing-brand-stamp" />
            </span>
          </p>
          <h1 className="page-title">Set new password</h1>
          <p className="page-subtitle">
            Pick a password you&apos;ll use for email sign-in.
          </p>
        </header>
        <ResetPasswordForm />
      </div>
    </section>
  );
}
