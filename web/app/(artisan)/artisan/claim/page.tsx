"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import { claimArtisanInvite } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";

function ClaimForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      showToast("Missing invite token", "error");
      return;
    }
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await claimArtisanInvite({
        token,
        display_name: String(data.get("display_name") || "").trim(),
        trades: String(data.get("trades") || ""),
        phone: String(data.get("phone") || "").trim() || undefined,
      });
      showToast("You’re on the roster");
      router.replace("/artisan");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Claim failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="dashboard">
      <p className="form-kicker">Artisan invite</p>
      <h1 className="page-title">Claim your invite</h1>
      <p className="page-subtitle">
        Sign in first, then complete your profile to join this landlord’s roster.
      </p>
      {!token ? (
        <p className="form-error">This link is missing a token.</p>
      ) : (
        <form className="form-card" onSubmit={(e) => void onSubmit(e)}>
          <label className="form-field">
            <span className="form-label">Display name</span>
            <input className="form-input" name="display_name" required disabled={submitting} />
          </label>
          <label className="form-field">
            <span className="form-label">Trades (comma-separated)</span>
            <input
              className="form-input"
              name="trades"
              placeholder="plumber, electrician"
              disabled={submitting}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Phone</span>
            <input className="form-input" name="phone" disabled={submitting} />
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Claiming…" : "Claim invite"}
          </button>
        </form>
      )}
    </section>
  );
}

export default function ArtisanClaimPage() {
  return (
    <Suspense
      fallback={<AuthLoadingGate variant="panel" label="Loading…" />}
    >
      <ClaimForm />
    </Suspense>
  );
}
