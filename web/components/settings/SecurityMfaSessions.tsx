"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type TotpFactor = {
  id: string;
  friendly_name?: string | null;
  status: string;
  factor_type?: string;
};

type EnrollState = {
  factorId: string;
  qr: string;
  secret: string;
} | null;

type Props = {
  onToast: (message: string) => void;
};

export function SecurityMfaSessions({ onToast }: Props) {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [sessionLabel, setSessionLabel] = useState("This browser");
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [{ data: factorData, error: factorError }, { data: userData }] =
        await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.auth.getUser(),
        ]);
      if (factorError) throw factorError;
      const totp = (factorData?.totp ?? []) as TotpFactor[];
      setFactors(totp.filter((f) => f.status === "verified"));
      const user = userData.user;
      if (user?.last_sign_in_at) {
        setLastSignIn(new Date(user.last_sign_in_at).toLocaleString());
      }
      const ua =
        typeof navigator !== "undefined" ? navigator.userAgent : "";
      if (/Mobile|Android|iPhone/i.test(ua)) setSessionLabel("This device");
      else if (/Edg\//.test(ua)) setSessionLabel("This browser (Edge)");
      else if (/Chrome\//.test(ua)) setSessionLabel("This browser (Chrome)");
      else if (/Firefox\//.test(ua)) setSessionLabel("This browser (Firefox)");
      else if (/Safari\//.test(ua)) setSessionLabel("This browser (Safari)");
      else setSessionLabel("This browser");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load security settings. Enable MFA in Supabase Auth if this persists.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnroll() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (enrollError) throw enrollError;
      if (!data?.id || !data.totp) {
        throw new Error("Could not start authenticator setup");
      }
      setEnroll({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start 2FA");
    } finally {
      setPending(false);
    }
  }

  async function confirmEnroll() {
    if (!enroll || code.trim().length < 6) return;
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) throw verify.error;
      setEnroll(null);
      setCode("");
      onToast("Two-step authentication enabled");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setPending(false);
    }
  }

  async function disableFactor(factorId: string) {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) throw unenrollError;
      onToast("Two-step authentication turned off");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable 2FA");
    } finally {
      setPending(false);
    }
  }

  async function signOutOthers() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "others",
      });
      if (signOutError) throw signOutError;
      onToast("Signed out other sessions");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign out other sessions",
      );
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <p className="page-subtitle">Loading security…</p>;
  }

  return (
    <div className="settings-security-extra">
      {error ? <p className="form-error">{error}</p> : null}

      <div className="settings-security-block">
        <span className="settings-pref-title">Two-step authentication</span>
        <p className="settings-pref-desc">
          Use an authenticator app (Google Authenticator, Authy) for a second
          code after email sign-in.
        </p>
        {factors.length > 0 ? (
          <ul className="settings-session-list">
            {factors.map((f) => (
              <li key={f.id} className="settings-session-row">
                <span>
                  {f.friendly_name || "Authenticator app"} · Enabled
                </span>
                <button
                  type="button"
                  className="table-link"
                  disabled={pending}
                  onClick={() => void disableFactor(f.id)}
                >
                  Disable
                </button>
              </li>
            ))}
          </ul>
        ) : enroll ? (
          <div className="settings-mfa-enroll">
            <p className="form-hint">
              Scan this QR code, then enter the 6-digit code from your app.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enroll.qr}
              alt="Authenticator QR code"
              className="settings-mfa-qr"
            />
            <p className="mono-data form-hint">Secret: {enroll.secret}</p>
            <label className="form-field">
              <span className="form-label">Verification code</span>
              <input
                className="form-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={pending}
              />
            </label>
            <div className="dashboard-header-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={pending || code.trim().length < 6}
                onClick={() => void confirmEnroll()}
              >
                Confirm and enable
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => {
                  setEnroll(null);
                  setCode("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() => void startEnroll()}
          >
            Enable
          </button>
        )}
      </div>

      <div className="settings-security-block">
        <span className="settings-pref-title">Login sessions</span>
        <p className="settings-pref-desc">
          Active sessions on your account. Sign out other devices if you lose a
          phone or shared computer.
        </p>
        <ul className="settings-session-list">
          <li className="settings-session-row">
            <span>
              <strong>{sessionLabel}</strong>
              <span className="table-muted"> · Current session</span>
              {lastSignIn ? (
                <span className="table-muted"> · Last activity {lastSignIn}</span>
              ) : null}
            </span>
          </li>
        </ul>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => void signOutOthers()}
        >
          Sign out other sessions
        </button>
      </div>
    </div>
  );
}
