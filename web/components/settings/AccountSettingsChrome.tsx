"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type SettingsTabId = "profile" | "notifications" | "security" | "cards";

export const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "cards", label: "Cards" },
  { id: "security", label: "Security" },
];

type Props = {
  homeHref: string;
  homeLabel?: string;
  settingsHref: string;
  tab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
  subtitle: string;
  children: ReactNode;
};

export function AccountSettingsChrome({
  homeHref,
  homeLabel = "Home",
  settingsHref,
  tab,
  onTabChange,
  subtitle,
  children,
}: Props) {
  const tabLabel =
    SETTINGS_TABS.find((item) => item.id === tab)?.label ?? "Profile";

  return (
    <section className="settings-page">
      <nav className="settings-breadcrumb" aria-label="Breadcrumb">
        <Link href={homeHref} className="settings-breadcrumb-link">
          {homeLabel}
        </Link>
        <span className="settings-breadcrumb-sep" aria-hidden>
          /
        </span>
        <Link href={settingsHref} className="settings-breadcrumb-link">
          Settings
        </Link>
        <span className="settings-breadcrumb-sep" aria-hidden>
          /
        </span>
        <span className="settings-breadcrumb-current">{tabLabel}</span>
      </nav>

      <header className="dashboard-header">
        <h1 className="page-title">Account settings</h1>
        <p className="page-subtitle">{subtitle}</p>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="settings-tab"
            aria-selected={tab === item.id}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {children}
    </section>
  );
}

/** Preferred-channel mismatch when SMS/WhatsApp needs phone or Email needs email. */
export function channelMismatchMessage(
  channel: string,
  phone: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const hasPhone = Boolean((phone || "").trim());
  const hasEmail = Boolean((email || "").trim());
  if ((channel === "sms" || channel === "whatsapp") && !hasPhone) {
    return `You prefer ${channel === "whatsapp" ? "WhatsApp" : "SMS"}, but this account has no phone. Add a number under Security or switch channel.`;
  }
  if (channel === "email" && !hasEmail) {
    return "You prefer Email, but this account has no email. Add one on Profile or switch channel.";
  }
  return null;
}
