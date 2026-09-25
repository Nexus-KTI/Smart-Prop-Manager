"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { useToast } from "@/components/ToastProvider";
import {
  previewApplicationToken,
  submitApplication,
} from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/client";

export function ApplyClient() {
  const params = useParams();
  const token = String(params?.token || "");
  const { showToast } = useToast();
  const [preview, setPreview] = useState<{
    property_name?: string | null;
    property_address?: string | null;
    unit_label?: string | null;
    rent_amount?: number | string | null;
    questions: Array<{ key: string; label: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await previewApplicationToken(token);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Invite not found");
        }
      }
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setAuthed(Boolean(data.session));
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authed) {
      showToast("Sign in to submit your application", "error");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const answers: Record<string, string> = {};
    for (const q of preview?.questions || []) {
      answers[q.key] = String(data.get(q.key) || "").trim();
    }
    setPending(true);
    try {
      await submitApplication(token, {
        applicant_name: String(data.get("applicant_name") || "").trim(),
        applicant_email: String(data.get("applicant_email") || "").trim() || undefined,
        applicant_phone: String(data.get("applicant_phone") || "").trim() || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
        screening_answers: answers,
      });
      setDone(true);
      showToast("Application submitted");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submit failed", "error");
    } finally {
      setPending(false);
    }
  }

  if (error) {
    return (
      <section className="dashboard">
        <h1 className="page-title">Application</h1>
        <p className="form-error">{error}</p>
        <Link href="/signup" className="btn-secondary">
          Sign up
        </Link>
      </section>
    );
  }

  if (!preview) {
    return <p className="page-subtitle">Loading application…</p>;
  }

  if (done) {
    return (
      <section className="dashboard">
        <h1 className="page-title">Submitted</h1>
        <p className="page-subtitle">
          The landlord will review your application. You can close this page.
        </p>
        <Link href="/tenant" className="btn-primary">
          Tenant home
        </Link>
      </section>
    );
  }

  return (
    <section className="dashboard">
      <h1 className="page-title">Apply for this unit</h1>
      <p className="page-subtitle">
        {preview.property_name || "Property"}
        {preview.unit_label ? ` · ${preview.unit_label}` : ""}
        {preview.property_address ? ` · ${preview.property_address}` : ""}
        {preview.rent_amount != null && preview.rent_amount !== ""
          ? ` · ${formatNaira(Number(preview.rent_amount))}`
          : ""}
      </p>
      {!authed ? (
        <p className="form-card">
          <Link href={`/login?next=/apply/${token}`} className="btn-primary">
            Sign in to apply
          </Link>{" "}
          <Link href={`/signup?role=tenant&next=/apply/${token}`} className="btn-secondary">
            Create account
          </Link>
        </p>
      ) : (
        <form className="form-card" onSubmit={onSubmit}>
          <label className="form-label">
            Full name
            <input name="applicant_name" required className="form-input" />
          </label>
          <label className="form-label">
            Email
            <input name="applicant_email" type="email" className="form-input" />
          </label>
          <label className="form-label">
            Phone
            <input name="applicant_phone" className="form-input" />
          </label>
          {preview.questions.map((q) => (
            <label key={q.key} className="form-label">
              {q.label}
              <input name={q.key} className="form-input" />
            </label>
          ))}
          <label className="form-label">
            Notes
            <textarea name="notes" className="form-input" rows={3} />
          </label>
          <button type="submit" className="btn-primary" disabled={pending}>
            Submit application
          </button>
        </form>
      )}
    </section>
  );
}
