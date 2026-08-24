"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { claimTenancyInvite } from "@/lib/api";
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
      await claimTenancyInvite(token);
      router.replace("/tenant");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setLinking(false);
    }
  }

  return (
    <section className="auth-card">
      <p className="auth-brand">{BRAND_NAME}</p>
      <h1 className="page-title">Claim your tenancy</h1>
      <p className="page-subtitle">
        Sign in with the phone on your invite, then we link your rent view.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {!token ? (
        <p className="form-error">Open the full invite link from your landlord.</p>
      ) : (
        <PhoneOtpFlow
          purpose="signin"
          onSuccess={() => {
            void afterAuth();
          }}
        />
      )}
      {linking ? <p className="page-subtitle">Linking tenancy…</p> : null}
    </section>
  );
}

export default function TenantClaimPage() {
  return (
    <Suspense fallback={<p className="page-subtitle">Loading…</p>}>
      <ClaimInner />
    </Suspense>
  );
}
