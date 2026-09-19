"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

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
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { fetchMe, updateMe } from "@/lib/api";
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
      "Send rent reminders and receipts as text messages (recommended).",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    description:
      "Requires a production WhatsApp sender in Twilio, not the sandbox.",
  },
  {
    value: "email",
    label: "Email",
    description: "Send rent reminders and receipts by email.",
  },
];

function normalizeChannel(value: string | null | undefined): NotificationChannel {
  if (value === "sms" || value === "email" || value === "whatsapp") return value;
  return "sms";
}

/** True when the account has an email/password identity (not phone-only). */
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

export function SettingsPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<SettingsTabId>("profile");

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [timezone, setTimezone] = useState("Africa/Lagos");
  const [dateFormat, setDateFormat] = useState<DateFormatOption>("dd/mm/yyyy");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [canChangePassword, setCanChangePassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadSeq = useRef(0);

  const [securityView, setSecurityView] = useState<SecurityView>("menu");
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [notificationChannel, setNotificationChannel] =
    useState<NotificationChannel>("sms");
  const [notifyPrefs, setNotifyPrefs] = useState<NotificationPrefs>(
    normalizeNotificationPrefs(null),
  );
  const [notifyPending, setNotifyPending] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);

  const retryLoad = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const seq = ++loadSeq.current;
    setProfileLoading(true);
    setProfileReady(false);
    setProfileError(null);

    (async () => {
      try {
        const supabase = createClient();
        const [{ data }, me] = await Promise.all([
          supabase.auth.getUser(),
          fetchMe(),
        ]);
        if (seq !== loadSeq.current) return;
        setFullName(me.name);
        setBusinessName(me.business_name ?? "");
        setPhone(me.phone ?? formatPhoneDisplay(data.user?.phone) ?? "");
        setEmail(me.email ?? data.user?.email ?? "");
        setEmailConfirmed(Boolean(me.email_confirmed));
        setTimezone(me.timezone || "Africa/Lagos");
        setDateFormat(
          me.date_format === "mm/dd/yyyy" || me.date_format === "yyyy-mm-dd"
            ? me.date_format
            : "dd/mm/yyyy",
        );
        setAvatarUrl(me.avatar_url ?? null);
        setNotificationChannel(normalizeChannel(me.notification_channel));
        setNotifyPrefs(normalizeNotificationPrefs(me.notification_prefs));
        setCanChangePassword(
          hasEmailPasswordAuth(
            data.user?.identities,
            me.email ?? data.user?.email ?? null,
          ),
        );
        setProfileReady(true);
      } catch (err) {
        if (seq !== loadSeq.current) return;
        setProfileReady(false);
        setFullName("");
        setBusinessName("");
        setPhone("");
        setEmail("");
        setEmailConfirmed(false);
        setProfileError(
          err instanceof Error ? err.message : "Failed to load profile",
        );
      } finally {
        if (seq === loadSeq.current) {
          setProfileLoading(false);
        }
      }
    })();
  }, [reloadKey]);

  async function onProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileReady || profileLoading) return;
    setProfileError(null);
    setProfilePending(true);

    const name = fullName.trim();
    if (!name) {
      setProfilePending(false);
      setProfileError("Name is required.");
      return;
    }

    try {
      const me = await updateMe({
        name,
        business_name: businessName.trim() || null,
        email: email.trim() || null,
        timezone,
        date_format: dateFormat,
      });
      setFullName(me.name);
      setBusinessName(me.business_name ?? "");
      setPhone(me.phone ?? "");
      setEmail(me.email ?? "");
      setEmailConfirmed(Boolean(me.email_confirmed));
      setTimezone(me.timezone || "Africa/Lagos");
      setDateFormat(
        me.date_format === "mm/dd/yyyy" || me.date_format === "yyyy-mm-dd"
          ? me.date_format
          : "dd/mm/yyyy",
      );
      showToast("Profile updated.");
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Could not update profile.",
      );
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
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: address,
      });
      if (error) throw error;
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

  async function onChannelChange(channel: NotificationChannel) {
    if (!profileReady || profileLoading) return;
    const previous = notificationChannel;
    setNotificationChannel(channel);
    setNotifyError(null);
    setNotifyPending(true);
    try {
      const me = await updateMe({ notification_channel: channel });
      setNotificationChannel(normalizeChannel(me.notification_channel));
      showToast("Notification preference saved.");
    } catch (err) {
      setNotificationChannel(previous);
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
    if (!profileReady || profileLoading) return;
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

  function onTabChange(next: SettingsTabId) {
    setTab(next);
    if (next !== "security") {
      setSecurityView("menu");
      setShowPasswordForm(false);
    }
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
      ? "Your details for account views, receipts, and tenant messages."
      : tab === "notifications"
        ? "Default channel and event matrix for reminders and receipts."
        : tab === "cards"
          ? "Saved cards for Paystack checkout."
          : canChangePassword
            ? "Phone, password, two-step authentication, and sessions."
            : "Phone, two-step authentication, and sessions.";

  const mismatch = channelMismatchMessage(notificationChannel, phone, email);

  if (!profileLoading && profileError && !profileReady) {
    return (
      <FetchErrorState
        title="Couldn’t load settings"
        message={profileError}
        onRetry={retryLoad}
      />
    );
  }

  return (
    <AccountSettingsChrome
      homeHref="/properties"
      homeLabel="Properties"
      settingsHref="/settings"
      tab={tab}
      onTabChange={onTabChange}
      subtitle={tabSubtitle}
    >
      {profileLoading ? <SettingsFormSkeleton label={tabLabel} /> : null}

      {!profileLoading && profileReady && tab === "profile" ? (
        <form
          className="form-card settings-card"
          onSubmit={onProfileSave}
          role="tabpanel"
          aria-label="Profile"
        >
          {profileError ? <p className="form-error">{profileError}</p> : null}

          <div className="settings-section">
            <p className="settings-section-title">Profile details</p>
            <p className="settings-section-lede">
              Your profile is visible to connected tenants and staff on your
              portfolio.
            </p>

            <ProfileAvatarEditor
              name={fullName || businessName}
              avatarUrl={avatarUrl}
              onUploaded={setAvatarUrl}
            />

            <label className="form-field">
              <span className="form-label">Name</span>
              <input
                className="form-input"
                name="name"
                type="text"
                required
                autoComplete="name"
                disabled={profilePending}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
              />
            </label>

            <label className="form-field">
              <span className="form-label">Business / Agency name</span>
              <input
                className="form-input"
                name="business_name"
                type="text"
                autoComplete="organization"
                disabled={profilePending}
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Optional"
              />
              <span className="form-help">
                Shown on receipts and reminders sent to tenants
              </span>
            </label>

            <div className="form-field">
              <span className="form-label">Phone number</span>
              <input
                className="form-input mono-data"
                name="phone"
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
                name="email"
                type="email"
                autoComplete="email"
                disabled={profilePending}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Optional"
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

          <div className="settings-section">
            <ThemeToggle />
          </div>

          <LocalePreferenceFields
            timezone={timezone}
            dateFormat={dateFormat}
            disabled={profilePending}
            onTimezoneChange={setTimezone}
            onDateFormatChange={setDateFormat}
          />

          <div className="form-actions">
            <button
              className="btn-primary"
              type="submit"
              disabled={profilePending}
            >
              {profilePending ? "Saving…" : "Update"}
            </button>
          </div>
          <p className="page-subtitle" style={{ marginTop: 16 }}>
            <Link href="/settings/team" className="table-link">
              Team &amp; roles
            </Link>
            {" · "}
            <Link href="/settings/audit" className="table-link">
              Staff audit
            </Link>
            {" · "}
            <Link href="/portfolios" className="table-link">
              Switch owner
            </Link>
          </p>
        </form>
      ) : null}

      {!profileLoading && profileReady && tab === "notifications" ? (
        <div
          className="form-card settings-card"
          role="tabpanel"
          aria-label="Notifications"
        >
          {notifyError ? <p className="form-error">{notifyError}</p> : null}
          {mismatch ? <p className="settings-callout">{mismatch}</p> : null}

          <fieldset
            className="settings-channel-fieldset"
            disabled={notifyPending}
          >
            <legend className="form-label">Reminder / receipt channel</legend>
            <p className="form-hint">
              Outbound channel for rent chase and receipts. Every unit’s tenant
              contact must match (phone for SMS/WhatsApp, email for Email) or
              the send fails. Tenants can turn off rent reminders in their own
              settings.
            </p>
            {CHANNEL_OPTIONS.map((option) => (
              <label key={option.value} className="settings-pref">
                <input
                  type="radio"
                  name="notification_channel"
                  value={option.value}
                  checked={notificationChannel === option.value}
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
            audience="landlord"
            prefs={notifyPrefs}
            disabled={notifyPending}
            onChange={setNotifyPrefs}
          />
          <div className="form-actions">
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

      {!profileLoading && profileReady && tab === "cards" ? (
        <PaymentCardsPanel
          paystackPublicKey={PAYSTACK_PUBLIC_KEY}
          onToast={showToast}
        />
      ) : null}

      {!profileLoading && profileReady && tab === "security" ? (
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
