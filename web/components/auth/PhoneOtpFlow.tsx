"use client";

import { FormEvent, ReactNode, useState } from "react";

import { OtpCodeField } from "@/components/auth/OtpCodeField";
import { PhoneInput } from "@/components/auth/PhoneInput";
import {
  AuthCaptcha,
  requireCaptchaToken,
} from "@/components/auth/AuthCaptcha";
import {
  authOtpChannelCodeSentHelp,
  authOtpChannelEnterCodeHelp,
  authOtpChannelLabel,
  authOtpChannelProviderError,
  authOtpChannelSendHelp,
  getAuthOtpChannel,
} from "@/lib/auth-otp-channel";
import { createClient } from "@/lib/supabase/client";
import { checkSmsDelivery } from "@/lib/api";
import { getPendingMfaFactorId, verifyMfaCode } from "@/lib/mfa";
import { isValidMobileE164, splitE164, toE164 } from "@/lib/phone";

export type PhoneOtpPurpose = "signup" | "signin" | "change";

type PhoneOtpFlowProps = {
  purpose: PhoneOtpPurpose;
  /** Signup only, collect name before sending OTP. */
  showName?: boolean;
  initialName?: string;
  /** Prefill from invite link WhatsApp / phone (E.164 or local). */
  initialPhone?: string;
  /** Extra auth user_metadata merged on signup OTP (role, qualify fields). */
  userMetadata?: Record<string, string | number | boolean | null | undefined>;
  className?: string;
  sendLabel?: string;
  verifyLabel?: string;
  onSuccess: (phone: string) => void | Promise<void>;
  onCancel?: () => void;
  footer?: ReactNode;
};

type Step = "details" | "otp" | "mfa";

function formatAuthError(error: {
  message?: string;
  code?: string;
  status?: number;
}): string {
  const code = (error.code || "").toLowerCase();
  const message = error.message || "Could not send verification code.";

  if (
    code.includes("rate_limit") ||
    message.toLowerCase().includes("only request this after")
  ) {
    return "Please wait a few seconds before requesting another code.";
  }
  return authOtpChannelProviderError(message) ?? message;
}

export function PhoneOtpFlow({
  purpose,
  showName = false,
  initialName = "",
  initialPhone = "",
  userMetadata,
  className,
  sendLabel = "Send verification code",
  verifyLabel = "Verify and continue",
  onSuccess,
  onCancel,
  footer,
}: PhoneOtpFlowProps) {
  const otpChannel = getAuthOtpChannel();
  const prefilled = splitE164(initialPhone);
  const [step, setStep] = useState<Step>("details");
  const [fullName, setFullName] = useState(initialName);
  const [countryCode, setCountryCode] = useState(
    prefilled?.countryCode ?? "+234",
  );
  const [localPhone, setLocalPhone] = useState(prefilled?.localPhone ?? "");
  const [e164Phone, setE164Phone] = useState("");
  const [otp, setOtp] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    const name = fullName.trim();
    const phone = toE164(countryCode, localPhone);

    if (showName && !name) {
      setPending(false);
      setError("Name is required.");
      return;
    }
    if (!isValidMobileE164(phone)) {
      setPending(false);
      setError("Enter a valid phone number (e.g. 801 234 5678).");
      return;
    }

    const supabase = createClient();
    let captcha: string | null = null;
    try {
      captcha = requireCaptchaToken(captchaToken);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Complete the captcha.");
      return;
    }

    let otpError: { message?: string; code?: string; status?: number } | null =
      null;

    try {
      if (purpose === "change") {
        const { error } = await supabase.auth.updateUser({ phone });
        otpError = error;
      } else if (purpose === "signup") {
        const meta: Record<string, string | number | boolean> = {
          full_name: name,
          name,
        };
        if (userMetadata) {
          for (const [key, value] of Object.entries(userMetadata)) {
            if (value === undefined || value === null || value === "") continue;
            meta[key] = value;
          }
        }
        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: {
            channel: otpChannel,
            data: meta,
            ...(captcha ? { captchaToken: captcha } : {}),
          },
        });
        otpError = error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: {
            channel: otpChannel,
            ...(captcha ? { captchaToken: captcha } : {}),
          },
        });
        otpError = error;
      }
      setCaptchaToken(null);
    } catch (err) {
      setPending(false);
      setError(
        err instanceof Error
          ? err.message
          : "Network error while sending the code. Try again.",
      );
      return;
    }

    setPending(false);

    if (otpError) {
      setError(formatAuthError(otpError));
      return;
    }

    setE164Phone(phone);
    setStep("otp");
    setInfo(authOtpChannelCodeSentHelp(phone, otpChannel));

    // Supabase often returns OK even when Twilio fails, or when Supabase Auth
    // still points at an older Twilio account than .env.
    if (otpChannel === "sms") {
      void (async () => {
        await new Promise((r) => setTimeout(r, 2800));
        try {
          const delivery = await checkSmsDelivery(phone);
          const failed =
            Boolean(delivery.hint) ||
            delivery.status === "failed" ||
            delivery.status === "undelivered" ||
            delivery.found === false;
          if (failed) {
            setInfo(null);
            setError(
              delivery.hint ||
                delivery.error_message ||
                `${authOtpChannelLabel(otpChannel)} was not delivered. Check Supabase Auth Phone Twilio settings and trial verified numbers.`,
            );
          }
        } catch {
          /* ignore probe failures, user can still enter a code if SMS arrived */
        }
      })();
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);

    const token = otp.replace(/\D/g, "").slice(0, 6);
    if (token.length !== 6) {
      setPending(false);
      setError(authOtpChannelEnterCodeHelp(otpChannel));
      return;
    }

    const supabase = createClient();
    // Supabase verify type stays "sms" for both SMS and WhatsApp delivery channels.
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone: e164Phone,
      token,
      type: purpose === "change" ? "phone_change" : "sms",
    });

    if (verifyError) {
      setPending(false);
      setError(formatAuthError(verifyError));
      return;
    }

    if (purpose !== "change" && !data.session) {
      setPending(false);
      setError(
        purpose === "signup"
          ? "Could not create your account. Try again."
          : "Could not sign in. Try again.",
      );
      return;
    }

    if (purpose === "signup") {
      const name = fullName.trim();
      if (name) {
        await supabase.auth.updateUser({
          data: {
            full_name: name,
            name,
          },
        });
      }
    }

    if (purpose === "signin" || purpose === "signup") {
      try {
        const factorId = await getPendingMfaFactorId();
        if (factorId) {
          setMfaFactorId(factorId);
          setStep("mfa");
          setPending(false);
          return;
        }
      } catch {
        /* continue without MFA step if AAL check fails */
      }
    }

    try {
      await onSuccess(e164Phone);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return;
    }

    setPending(false);
  }

  async function onMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfaFactorId) return;
    setError(null);
    setPending(true);
    try {
      await verifyMfaCode(mfaFactorId, mfaCode);
      await onSuccess(e164Phone);
      setPending(false);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Invalid authentication code");
    }
  }

  if (step === "mfa") {
    return (
      <form className={className} onSubmit={(e) => void onMfaSubmit(e)}>
        <p className="form-hint">
          Enter the 6-digit code from your authenticator app.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <label className="form-field">
          <span className="form-label">Authentication code</span>
          <input
            className="form-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            required
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            disabled={pending}
          />
        </label>
        <div className="form-actions auth-actions">
          <button className="btn-primary" type="submit" disabled={pending}>
            {pending ? "Verifying…" : "Verify and continue"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() => {
              setMfaFactorId(null);
              setMfaCode("");
              setStep("details");
              void createClient().auth.signOut();
            }}
          >
            Back
          </button>
        </div>
        {footer}
      </form>
    );
  }

  if (step === "otp") {
    return (
      <form className={className} onSubmit={verifyOtp}>
        {error ? <p className="form-error">{error}</p> : null}
        {info ? <p className="form-success">{info}</p> : null}

        <OtpCodeField value={otp} onChange={setOtp} disabled={pending} />

        <div
          className={
            onCancel
              ? "form-actions form-actions-split"
              : "form-actions auth-actions"
          }
        >
          {onCancel ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancel}
              disabled={pending}
            >
              Cancel
            </button>
          ) : null}
          <button className="btn-primary" type="submit" disabled={pending}>
            {pending ? "Verifying…" : verifyLabel}
          </button>
        </div>

        <button
          type="button"
          className="auth-alt-link"
          onClick={() => {
            setStep("details");
            setOtp("");
            setError(null);
            setInfo(null);
          }}
          disabled={pending}
        >
          Use a different number
        </button>

        {footer}
      </form>
    );
  }

  return (
    <form className={className} onSubmit={sendOtp}>
      {error ? <p className="form-error">{error}</p> : null}
      {info ? <p className="form-success">{info}</p> : null}

      {showName ? (
        <label className="form-field">
          <span className="form-label">Name</span>
          <input
            className="form-input"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Your full name"
            value={fullName}
            disabled={pending}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
      ) : null}

      <label className="form-field">
        <span className="form-label">Phone number</span>
        <PhoneInput
          countryCode={countryCode}
          localPhone={localPhone}
          onCountryCodeChange={setCountryCode}
          onLocalPhoneChange={setLocalPhone}
          disabled={pending}
        />
        <span className="form-help">{authOtpChannelSendHelp(otpChannel)}</span>
      </label>

      <AuthCaptcha token={captchaToken} onToken={setCaptchaToken} />

      <div
        className={
          onCancel
            ? "form-actions form-actions-split"
            : "form-actions auth-actions"
        }
      >
        {onCancel ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
        ) : null}
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Sending code…" : sendLabel}
        </button>
      </div>

      {footer}
    </form>
  );
}
