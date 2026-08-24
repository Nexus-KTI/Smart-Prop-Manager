"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Props = {
  inviteOnly?: boolean;
};

export function MarketingCtaForm({ inviteOnly = false }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const whatsapp = String(form.get("whatsapp") ?? "").trim();
    const unitCount = Number(String(form.get("unit_count") ?? "").trim());

    if (!name || !whatsapp) {
      setError("Name and WhatsApp number are required.");
      setPending(false);
      return;
    }

    if (!Number.isInteger(unitCount) || unitCount < 1) {
      setError("Enter a valid number of properties.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error: insertError } = await supabase.from("leads").insert({
      name,
      whatsapp,
      unit_count: unitCount,
      source: "access",
    });

    setPending(false);

    if (insertError) {
      setError("Could not submit. Please try again.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="marketing-cta-confirm">
        <p className="marketing-cta-confirm-title">Thanks. We received your details.</p>
        <p className="page-subtitle">
          {inviteOnly
            ? "We’ll message you on WhatsApp when your invite is ready. If you already have an invite link, "
            : "We’ll message you on WhatsApp shortly. You can also "}
          <a href="/signup">
            {inviteOnly ? "open signup with that link" : "create a free account"}
          </a>
          {inviteOnly ? "." : " anytime."}
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

      <label className="form-field">
        <span className="form-label">Number of properties managed</span>
        <input
          className="form-input mono-data"
          name="unit_count"
          type="number"
          inputMode="numeric"
          required
          min={1}
          step={1}
          placeholder="e.g. 12"
        />
      </label>

      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Message me on WhatsApp"}
      </button>
      <p className="marketing-cta-privacy">
        We won’t share your WhatsApp number. It’s only for Nexora follow-up.
        {inviteOnly ? (
          <>
            {" "}
            Already invited?{" "}
            <a href="/signup">Use your invite link to sign up</a>.
          </>
        ) : (
          <>
            {" "}
            Or <a href="/signup">create a free account</a> yourself.
          </>
        )}
      </p>
    </form>
  );
}
