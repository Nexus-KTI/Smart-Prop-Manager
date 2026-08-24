import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { BRAND_NAME } from "@/lib/brand";

export default function ResetPasswordPage() {
  return (
    <section className="auth-page">
      <div className="auth-panel">
        <header className="auth-header">
          <p className="auth-brand">{BRAND_NAME}</p>
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
