"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { FetchErrorState } from "@/components/FetchErrorState";
import { ProfileAvatarEditor } from "@/components/ProfileAvatarEditor";
import {
  AccountSettingsChrome,
  channelMismatchMessage,
  type SettingsTabId,
} from "@/components/settings/AccountSettingsChrome";
import {
  LocalePreferenceFields,
  type DateFormatOption,
} from "@/components/settings/LocalePreferenceFields";
import {
  NotificationPrefsMatrix,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from "@/components/settings/NotificationPrefsMatrix";
import { PaymentCardsPanel } from "@/components/settings/PaymentCardsPanel";
import { SecurityMfaSessions } from "@/components/settings/SecurityMfaSessions";
import { useToast } from "@/components/ToastProvider";
import { connectLandlord, fetchMe, updateMe } from "@/lib/api";
import { formatPhoneDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

type SecurityView = "menu" | "phone";
type NotificationChannel = "whatsapp" | "sms" | "email";

const PAYSTACK_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";

const CHANNEL_OPTIONS: {
  value: NotificationChannel;
  label: string;
  description: string;
}[] = [
  {
    value: "sms",
    label: "SMS",
    description:
      "Prefer SMS for rent reminders and notices when your landlord’s notify is configured.",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    description:
      "Prefer WhatsApp when a production sender is set on your landlord’s side.",
  },
  {
    value: "email",
    label: "Email",
    description:
      "Prefer email for rent reminders and notices when email notify is configured.",
  },
];

function normalizeChannel(value: string | null | undefined): NotificationChannel {
  if (value === "sms" || value === "email" || value === "whatsapp") return value;
  return "sms";
}

function hasEmailPasswordAuth(
  identities: { provider?: string }[] | undefined,
  email: string | null,
): boolean {
  const list = identities ?? [];
  if (list.some((item) => item.provider === "email")) return true;
  if (list.some((item) => item.provider === "phone")) return false;
  return Boolean(email);
}

function SettingsFormSkeleton({ label }: { label: string }) {
  return (
    <div
      className="form-card settings-card"
      aria-busy="true"
      aria-label={`Loading ${label.toLowerCase()}`}
    >
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="form-field" aria-hidden>
          <span className="form-label">
            <span
              className="skeleton-bar"
              style={{ width: 72 + (index % 3) * 16 }}
            />
          </span>
          <span className="skeleton-bar skeleton-input" style={{ width: "100%" }} />
        </div>
      ))}
      <div className="form-actions" aria-hidden>
        <span
          className="skeleton-bar"
          style={{ width: 96, height: 40, borderRadius: 6 }}
        />
      </div>
    </div>
  );
}

export function TenantSettingsClient() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<SettingsTabId>("profile");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [dateFormat, setDateFormat] = useState<DateFormatOption>("dd/mm/yyyy");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [channel, setChannel] = useState<NotificationChannel>("sms");
  const [notifyPrefs, setNotifyPrefs] = useState<NotificationPrefs>(
    normalizeNotificationPrefs(null),
  );
  const [canChangePassword, setCanChangePassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [notifyPending, setNotifyPending] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadSeq = useRef(0);

  const [securityView, setSecurityView] = useState<SecurityView>("menu");
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const retryLoad = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setReady(false);
    setError(null);

    (async () => {
      try {
        const supabase = createClient();
        const [{ data }, me] = await Promise.all([
          supabase.auth.getUser(),
          fetchMe(),
        ]);
        if (seq !== loadSeq.current) return;
        setName(me.name || "");
        setEmail(me.email || data.user?.email || "");
        setEmailConfirmed(Boolean(me.email_confirmed));
        setPhone(me.phone ?? formatPhoneDisplay(data.user?.phone) ?? "");
        setTimezone(me.timezone || "Africa/Lagos");
        setDateFormat(
          me.date_format === "mm/dd/yyyy" || me.date_format === "yyyy-mm-dd"
            ? me.date_format
            : "dd/mm/yyyy",
        );
        setAvatarUrl(me.avatar_url ?? null);
        setChannel(normalizeChannel(me.notification_channel));
        setNotifyPrefs(normalizeNotificationPrefs(me.notification_prefs));
        setCanChangePassword(
          hasEmailPasswordAuth(
            data.user?.identities,
            me.email ?? data.user?.email ?? null,
          ),
        );
        setReady(true);
      } catch (err) {
        if (seq !== loadSeq.current) return;
        setReady(false);
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    })();
  }, [reloadKey]);

  function onTabChange(next: SettingsTabId) {
    setTab(next);
    if (next !== "security") {
      setSecurityView("menu");
      setShowPasswordForm(false);
    }
  }

  async function onProfileSave(event: FormEvent) {
    event.preventDefault();
    if (!ready || loading) return;
    setProfilePending(true);
    setError(null);
    try {
      const me = await updateMe({
        name: name.trim(),
        email: email.trim() || null,
        timezone,
        date_format: dateFormat,
      });
      setName(me.name);
      setEmail(me.email || "");
      setEmailConfirmed(Boolean(me.email_confirmed));
      setPhone(me.phone ?? "");
      setTimezone(me.timezone || "Africa/Lagos");
      setDateFormat(
        me.date_format === "mm/dd/yyyy" || me.date_format === "yyyy-mm-dd"
          ? me.date_format
          : "dd/mm/yyyy",
      );
      showToast("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setProfilePending(false);
    }
  }

  async function onResendVerification() {
    const address = email.trim();
    if (!address) {
      showToast("Add an email on your profile first.", "error");
      return;
    }
    setVerifyPending(true);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: address,
      });
      if (resendError) throw resendError;
      showToast("Verification email sent.");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not send verification email.",
        "error",
      );
    } finally {
      setVerifyPending(false);
    }
  }

  async function onChannelChange(next: NotificationChannel) {
    if (!ready || loading) return;
    const previous = channel;
    setChannel(next);
    setNotifyError(null);
    setNotifyPending(true);
    try {
      const me = await updateMe({ notification_channel: next });
      setChannel(normalizeChannel(me.notification_channel));
      showToast("Notification preference saved.");
    } catch (err) {
      setChannel(previous);
      setNotifyError(
        err instanceof Error
          ? err.message
          : "Could not save notification preference.",
      );
    } finally {
      setNotifyPending(false);
    }
  }

  async function onSaveNotifyPrefs() {
    if (!ready || loading) return;
    setNotifyError(null);
    setNotifyPending(true);
    try {
      const me = await updateMe({ notification_prefs: notifyPrefs });
      setNotifyPrefs(normalizeNotificationPrefs(me.notification_prefs));
      showToast("Event preferences saved.");
    } catch (err) {
      setNotifyError(
        err instanceof Error
          ? err.message
          : "Could not save event preferences.",
      );
    } finally {
      setNotifyPending(false);
    }
  }

  async function onPhoneChanged(nextPhone: string) {
    setPhone(formatPhoneDisplay(nextPhone));
    setSecurityView("menu");
    showToast("Phone number updated.");
  }

  const tabLabel =
    tab === "profile"
      ? "Profile"
      : tab === "notifications"
        ? "Notifications"
        : tab === "cards"
          ? "Cards"
          : "Security";
  const tabSubtitle =
    tab === "profile"
      ? "Your name and how you appear to your landlord."
      : tab === "notifications"
        ? "Preferred channel and which events reach you."
        : tab === "cards"
          ? "Saved cards for faster Paystack rent payments."
          : canChangePassword
            ? "Phone, password, two-step authentication, and sessions."
            : "Phone, two-step authentication, and sessions.";

  const mismatch = channelMismatchMessage(channel, phone, email);

  if (!loading && error && !ready) {
    return (
      <FetchErrorState
        title="Couldn’t load settings"
        message={error}
        onRetry={retryLoad}
      />
    );
  }

  return (
    <AccountSettingsChrome
      homeHref="/tenant"
      homeLabel="Home"
      settingsHref="/tenant/settings"
      tab={tab}
      onTabChange={onTabChange}
      subtitle={tabSubtitle}
    >
      {loading ? <SettingsFormSkeleton label={tabLabel} /> : null}

      {!loading && ready && tab === "profile" ? (
        <div className="settings-stack">
          <form
            className="form-card settings-card"
            onSubmit={onProfileSave}
            role="tabpanel"
            aria-label="Profile"
          >
            {error ? <p className="form-error">{error}</p> : null}

            <div className="settings-section">
              <p className="settings-section-title">Profile details</p>
              <p className="settings-section-lede">
                Your profile is visible to your connected landlord.
              </p>

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
                  disabled={profilePending}
                />
              </label>

              <div className="form-field">
                <span className="form-label">Phone number</span>
                <input
                  className="form-input mono-data"
                  type="tel"
                  readOnly
                  disabled
                  value={phone}
                  placeholder="No phone on file"
                />
                <span className="form-help">
                  Change your number from the Security tab.
                </span>
              </div>
            </div>

            <div className="settings-section">
              <p className="settings-section-title">Email address</p>
              <label className="form-field">
                <span className="form-label">Email</span>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="Optional"
                  disabled={profilePending}
                />
              </label>
              {email.trim() ? (
                <div className="settings-email-row">
                  <span
                    className={`status-badge ${emailConfirmed ? "verified" : "unverified"}`}
                  >
                    {emailConfirmed ? "Verified" : "Unverified"}
                  </span>
                  {!emailConfirmed ? (
                    <div className="settings-email-actions">
                      <button
                        type="button"
                        className="settings-inline-link"
                        disabled={verifyPending || profilePending}
                        onClick={() => void onResendVerification()}
                      >
                        {verifyPending ? "Sending…" : "Verify"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <LocalePreferenceFields
              timezone={timezone}
              dateFormat={dateFormat}
              disabled={profilePending}
              onTimezoneChange={setTimezone}
              onDateFormatChange={setDateFormat}
            />

            <div className="form-actions">
              <button className="btn-primary" type="submit" disabled={profilePending}>
                {profilePending ? "Saving…" : "Update"}
              </button>
              <Link href="/tenant" className="btn-secondary">
                Back to home
              </Link>
            </div>
          </form>

          <form
            className="form-card settings-card"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void (async () => {
                try {
                  await connectLandlord({
                    landlord_email: String(data.get("landlord_email") || "").trim(),
                    landlord_name:
                      String(data.get("landlord_name") || "").trim() || undefined,
                    message: String(data.get("message") || "").trim() || undefined,
                  });
                  showToast(
                    "Invite emailed to your landlord (if SMTP is configured)",
                  );
                  event.currentTarget.reset();
                } catch (err) {
                  showToast(err instanceof Error ? err.message : "Could not send", "error");
                }
              })();
            }}
          >
            <div className="settings-section">
              <p className="settings-section-title">Invite your landlord</p>
              <p className="settings-section-lede">
                Sends them a signup link so they can create a landlord account and
                invite you properly.
              </p>
              <label className="form-field">
                <span className="form-label">Landlord email</span>
                <input
                  className="form-input"
                  name="landlord_email"
                  type="email"
                  required
                />
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
            </div>
          </form>
        </div>
      ) : null}

      {!loading && ready && tab === "notifications" ? (
        <div
          className="form-card settings-card"
          role="tabpanel"
          aria-label="Notifications"
        >
          {notifyError ? <p className="form-error">{notifyError}</p> : null}
          {mismatch ? <p className="settings-callout">{mismatch}</p> : null}

          <fieldset className="settings-channel-fieldset" disabled={notifyPending}>
            <legend className="form-label">Preferred notice channel</legend>
            <p className="form-hint">
              Your contact details must match this channel or notices can fail.
            </p>
            {CHANNEL_OPTIONS.map((option) => (
              <label key={option.value} className="settings-pref">
                <input
                  type="radio"
                  name="notification_channel"
                  value={option.value}
                  checked={channel === option.value}
                  onChange={() => void onChannelChange(option.value)}
                />
                <span>
                  <span className="settings-pref-title">{option.label}</span>
                  <span className="settings-pref-desc">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <NotificationPrefsMatrix
            audience="tenant"
            prefs={notifyPrefs}
            disabled={notifyPending}
            onChange={setNotifyPrefs}
          />
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn-primary"
              disabled={notifyPending}
              onClick={() => void onSaveNotifyPrefs()}
            >
              {notifyPending ? "Saving…" : "Save event preferences"}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && ready && tab === "cards" ? (
        <PaymentCardsPanel
          paystackPublicKey={PAYSTACK_PUBLIC_KEY}
          onToast={showToast}
        />
      ) : null}

      {!loading && ready && tab === "security" ? (
        <div
          className="form-card settings-card"
          role="tabpanel"
          aria-label="Security"
        >
          {securityView === "phone" ? (
            <div className="settings-phone-change">
              <PhoneOtpFlow
                purpose="change"
                className="settings-inline-form"
                onSuccess={onPhoneChanged}
                onCancel={() => setSecurityView("menu")}
              />
            </div>
          ) : (
            <div className="settings-security-actions">
              <div className="settings-security-block">
                <span className="settings-pref-title">Phone number</span>
                <p className="settings-pref-desc mono-data">
                  {phone.trim() ? phone : "No phone on file"}
                </p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSecurityView("phone")}
                >
                  Change phone
                </button>
              </div>

              {canChangePassword ? (
                <div className="settings-security-block">
                  <span className="settings-pref-title">Password</span>
                  <p className="settings-pref-desc">
                    Update the password for email sign-in.
                  </p>
                  {showPasswordForm ? (
                    <ChangePasswordForm
                      className="settings-inline-form"
                      onSuccess={() => {
                        setShowPasswordForm(false);
                        showToast("Password updated.");
                      }}
                      onCancel={() => setShowPasswordForm(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setShowPasswordForm(true)}
                    >
                      Change password
                    </button>
                  )}
                </div>
              ) : null}

              <SecurityMfaSessions onToast={showToast} />
            </div>
          )}
        </div>
      ) : null}
    </AccountSettingsChrome>
  );
}
