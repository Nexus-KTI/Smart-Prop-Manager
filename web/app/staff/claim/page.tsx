"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { claimStaffInvite } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";

function ClaimInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  async function afterAuth() {
    if (!token) {
      setError("Missing invite token");
      return;
    }
    setLinking(true);
    setError(null);
    try {
      await claimStaffInvite(token);
      router.replace("/ops");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setLinking(false);
    }
  }

  if (linking) {
    return <AuthLoadingGate label="Linking your access…" />;
  }

  return (
    <section className="auth-card">
      <p className="auth-brand">{BRAND_NAME}</p>
      <h1 className="page-title">Claim staff invite</h1>
      <p className="page-subtitle">
        Sign in with the phone on your invite, then we link your Manager or
        Caretaker access.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {!token ? (
        <p className="form-error">Open the full invite link from the owner.</p>
      ) : (
        <PhoneOtpFlow
          purpose="signin"
          onSuccess={() => {
            void afterAuth();
          }}
        />
      )}
    </section>
  );
}

export default function StaffClaimPage() {
  return (
    <Suspense
      fallback={<AuthLoadingGate variant="panel" label="Loading…" />}
    >
      <ClaimInner />
    </Suspense>
  );
}
