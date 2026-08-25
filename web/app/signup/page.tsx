import { Suspense } from "react";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { SignupForm } from "@/components/SignupForm";

export default function SignupPage() {
  return (
    <section className="auth-page auth-page--signup">
      <Suspense
        fallback={<AuthLoadingGate variant="fullscreen" label="Loading…" />}
      >
        <SignupForm />
      </Suspense>
    </section>
  );
}
