"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { ProfileAvatarEditor } from "@/components/ProfileAvatarEditor";
import { useToast } from "@/components/ToastProvider";
import { connectLandlord, fetchMe, updateMe } from "@/lib/api";

type NotificationChannel = "whatsapp" | "sms" | "email";

function normalizeChannel(value: string | null | undefined): NotificationChannel {
  if (value === "sms" || value === "email" || value === "whatsapp") return value;
  return "sms";
}

export function TenantSettingsClient() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [channel, setChannel] = useState<NotificationChannel>("sms");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setName(me.name || "");
        setEmail(me.email || "");
        setPhone(me.phone);
        setAvatarUrl(me.avatar_url ?? null);
        setChannel(normalizeChannel(me.notification_channel));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const me = await updateMe({
        name: name.trim(),
        email: email.trim() || null,
        notification_channel: channel,
      });
      setName(me.name);
      setEmail(me.email || "");
      setPhone(me.phone);
      setChannel(normalizeChannel(me.notification_channel));
      showToast("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <p className="page-subtitle">Loading settings…</p>;
  if (error && !name && !email) {
    return (
      <FetchErrorState
        title="Couldn’t load settings"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <section className="dashboard">
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">
        Your name and how {phone ? "we reach you" : "you prefer notices"}. Phone
        changes stay on the security flow from your account menu when signed in
        with phone.
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <form className="form-card" style={{ maxWidth: 480 }} onSubmit={onSave}>
        <ProfileAvatarEditor
          name={name}
          avatarUrl={avatarUrl}
          onUploaded={setAvatarUrl}
        />
        <label className="form-field">
          <span className="form-label">Display name</span>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </label>
        <label className="form-field">
          <span className="form-label">Email</span>
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="optional"
          />
        </label>
        {phone ? (
          <p className="table-muted">
            Phone on account: <span className="mono-data">{phone}</span>
          </p>
        ) : null}
        <fieldset className="form-field" style={{ border: "none", padding: 0 }}>
          <legend className="form-label">Preferred notice channel</legend>
          {(
            [
              ["sms", "SMS"],
              ["whatsapp", "WhatsApp"],
              ["email", "Email"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="signup-radio-row" style={{ marginBottom: 8 }}>
              <input
                type="radio"
                name="channel"
                checked={channel === value}
                onChange={() => setChannel(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <button className="btn-primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <Link href="/tenant" className="btn-secondary">
            Back to home
          </Link>
        </div>
      </form>

      <form
        className="form-card"
        style={{ maxWidth: 480, marginTop: 24 }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void (async () => {
            try {
              await connectLandlord({
                landlord_email: String(data.get("landlord_email") || "").trim(),
                landlord_name: String(data.get("landlord_name") || "").trim() || undefined,
                message: String(data.get("message") || "").trim() || undefined,
              });
              showToast("Invite emailed to your landlord (if SMTP is configured)");
              event.currentTarget.reset();
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Could not send");
            }
          })();
        }}
      >
        <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
          Invite your landlord
        </h2>
        <p className="page-subtitle">
          Sends them a signup link so they can create a landlord account and invite
          you properly.
        </p>
        <label className="form-field">
          <span className="form-label">Landlord email</span>
          <input className="form-input" name="landlord_email" type="email" required />
        </label>
        <label className="form-field">
          <span className="form-label">Landlord name</span>
          <input className="form-input" name="landlord_name" />
        </label>
        <label className="form-field">
          <span className="form-label">Message</span>
          <input className="form-input" name="message" />
        </label>
        <button className="btn-secondary" type="submit">
          Send invite
        </button>
      </form>
    </section>
  );
}
