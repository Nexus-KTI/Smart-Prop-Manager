"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { claimTenancyInvite } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import { normalizeTenancyClaimToken } from "@/lib/tenancy-invite";

type AuthMode = "signin" | "signup";

function ClaimInner() {
  const params = useSearchParams();
  const router = useRouter();
  const tokenFromUrl = normalizeTenancyClaimToken(params.get("token") || "");
  const [pastedToken, setPastedToken] = useState("");
  const token = tokenFromUrl || normalizeTenancyClaimToken(pastedToken);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [checkingSession, setCheckingSession] = useState(Boolean(tokenFromUrl));
  const [authMode, setAuthMode] = useState<AuthMode>("signup");

  async function claimWithToken(resolved: string) {
    setLinking(true);
    setError(null);
    try {
      await claimTenancyInvite(resolved);
      router.replace("/tenant");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setLinking(false);
    }
  }

  useEffect(() => {
    if (!tokenFromUrl) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (user) {
        await claimWithToken(tokenFromUrl);
        return;
      }
      setCheckingSession(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claim once per token
  }, [tokenFromUrl]);

  function onPasteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const resolved = normalizeTenancyClaimToken(pastedToken);
    if (!resolved) {
      setError("Paste the full invite link or the token from it.");
      return;
    }
    setError(null);
    router.replace(`/tenant/claim?token=${encodeURIComponent(resolved)}`);
  }

  if (linking || checkingSession) {
    return (
      <AuthLoadingGate
        label={checkingSession ? "Checking your session…" : "Linking your tenancy…"}
      />
    );
  }

  return (
    <section className="auth-card">
      <p className="auth-brand">{BRAND_NAME}</p>
      <h1 className="page-title">Claim your tenancy</h1>
      <p className="page-subtitle">
        Use the invite link from your landlord. New here? Create an account with
        the phone on the invite.
      </p>
      {error ? <p className="form-error">{error}</p> : null}

      {!tokenFromUrl ? (
        <form className="auth-tab-panel" onSubmit={onPasteSubmit}>
          <label className="form-field">
            <span className="form-label">Invite link or token</span>
            <input
              className="form-input"
              value={pastedToken}
              onChange={(event) => setPastedToken(event.target.value)}
              placeholder="Paste invite link or token"
              autoComplete="off"
              required
            />
            <span className="form-help">
              Looks like …/tenant/claim?token=… or the token alone.
            </span>
          </label>
          <div className="form-actions auth-actions">
            <button className="btn-primary" type="submit">
              Continue
            </button>
          </div>
          <p className="auth-switch">
            Landlord hasn’t invited you yet? Ask them to open the unit →{" "}
            <strong>Start tenancy &amp; invite</strong>.
          </p>
        </form>
      ) : (
        <>
          <div className="auth-tabs" role="tablist" aria-label="Claim method">
            <button
              type="button"
              role="tab"
              className="auth-tab"
              aria-selected={authMode === "signup"}
              onClick={() => setAuthMode("signup")}
            >
              New account
            </button>
            <button
              type="button"
              role="tab"
              className="auth-tab"
              aria-selected={authMode === "signin"}
              onClick={() => setAuthMode("signin")}
            >
              I have an account
            </button>
          </div>

          <PhoneOtpFlow
            key={authMode}
            purpose={authMode}
            showName={authMode === "signup"}
            userMetadata={authMode === "signup" ? { role: "tenant" } : undefined}
            className="auth-tab-panel"
            verifyLabel={
              authMode === "signup" ? "Verify and claim" : "Verify and claim"
            }
            onSuccess={() => {
              void claimWithToken(token);
            }}
            footer={
              <p className="auth-switch">
                Prefer email signup?{" "}
                <Link
                  href={`/signup?role=tenant&token=${encodeURIComponent(token)}`}
                  className="auth-alt-link"
                >
                  Create account
                </Link>
              </p>
            }
          />
        </>
      )}
    </section>
  );
}

export default function TenantClaimPage() {
  return (
    <Suspense
      fallback={<AuthLoadingGate variant="panel" label="Loading…" />}
    >
      <ClaimInner />
    </Suspense>
  );
}
