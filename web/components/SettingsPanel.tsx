"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { FetchErrorState } from "@/components/FetchErrorState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ToastProvider";
import { fetchMe, updateMe } from "@/lib/api";
import { formatPhoneDisplay } from "@/lib/phone";
import { createClient } from "@/lib/supabase/client";

type TabId = "profile" | "notifications" | "security";
type SecurityView = "menu" | "phone";

const TABS: { id: TabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
];

type NotificationChannel = "whatsapp" | "sms" | "email";

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
      "Requires a production WhatsApp sender in Twilio — not the sandbox.",
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
  // Legacy sessions without identity metadata
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
  const [tab, setTab] = useState<TabId>("profile");

  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [canChangePassword, setCanChangePassword] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadSeq = useRef(0);

  const [securityView, setSecurityView] = useState<SecurityView>("menu");
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [notificationChannel, setNotificationChannel] =
    useState<NotificationChannel>("sms");
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
        setNotificationChannel(normalizeChannel(me.notification_channel));
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
        setProfileError(
          err instanceof Error ? err.message : "Failed to load profile",
        );
      } finally {
        // Always clear skeleton for the latest request (avoids stuck/empty flash).
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
      });
      setFullName(me.name);
      setBusinessName(me.business_name ?? "");
      setPhone(me.phone ?? "");
      setEmail(me.email ?? "");
      showToast("Profile updated.");
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : "Could not update profile.",
      );
    } finally {
      setProfilePending(false);
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
        : "Security";
  const tabSubtitle =
    tab === "profile"
      ? "Your details for account views, receipts, and tenant messages."
      : tab === "notifications"
        ? "Default channel for rent reminders and payment receipts sent to tenants."
        : canChangePassword
          ? "Update the phone number on this account, or change your password."
          : "Update the phone number on this account.";

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
    <section className="settings-page">
      <header className="dashboard-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">{tabSubtitle}</p>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="settings-tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id);
              if (item.id !== "security") {
                setSecurityView("menu");
                setShowPasswordForm(false);
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {profileLoading ? <SettingsFormSkeleton label={tabLabel} /> : null}

      {!profileLoading && profileReady && tab === "profile" ? (
        <form
          className="form-card settings-card"
          onSubmit={onProfileSave}
          role="tabpanel"
          aria-label="Profile"
        >
          {profileError ? <p className="form-error">{profileError}</p> : null}

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

          <label className="form-field">
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
          </label>

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

          <ThemeToggle />

          <div className="form-actions">
            <button
              className="btn-primary"
              type="submit"
              disabled={profilePending}
            >
              {profilePending ? "Saving…" : "Save"}
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

          <fieldset
            className="settings-channel-fieldset"
            disabled={notifyPending}
          >
            <legend className="form-label">Reminder / receipt channel</legend>
            <p className="form-hint">
              Every unit’s tenant contact must match this channel — phone for
              SMS/WhatsApp, email address for Email — or reminders will fail.
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
        </div>
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
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
