"use client";

import { FormEvent, useState } from "react";

import {
  AuthCaptcha,
  captchaRequired,
  requireCaptchaToken,
} from "@/components/auth/AuthCaptcha";
import { submitPublicLead } from "@/lib/public-leads";

export function MarketingCallbackForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const whatsapp = String(form.get("whatsapp") ?? "").trim();

    if (!name || !whatsapp) {
      setError("Name and WhatsApp number are required.");
      setPending(false);
      return;
    }

    let captcha: string | null = null;
    try {
      captcha = requireCaptchaToken(captchaToken);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Complete the captcha.");
      return;
    }

    try {
      await submitPublicLead({
        name,
        whatsapp,
        unit_count: null,
        source: "callback",
        captcha_token: captcha,
      });
      setCaptchaToken(null);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="marketing-cta-confirm">
        <p className="marketing-cta-confirm-title">Got it. We’ll call you on WhatsApp.</p>
        <p className="page-subtitle">
          Leave your phone nearby. We only use this number to reach you.
        </p>
      </div>
    );
  }

  return (
    <form className="marketing-cta-form" onSubmit={onSubmit}>
      {error ? <p className="form-error">{error}</p> : null}

      <label className="form-field">
        <span className="form-label">Name</span>
        <input
          className="form-input"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder="Your full name"
        />
      </label>

      <label className="form-field">
        <span className="form-label">WhatsApp number</span>
        <input
          className="form-input mono-data"
          name="whatsapp"
          type="tel"
          required
          autoComplete="tel"
          placeholder="+234…"
        />
      </label>

      {captchaRequired() ? (
        <AuthCaptcha token={captchaToken} onToken={setCaptchaToken} />
      ) : null}

      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Request callback"}
      </button>
      <p className="marketing-cta-privacy">
        We won’t share your WhatsApp number. It’s only for Nexora follow-up.
      </p>
    </form>
  );
}
