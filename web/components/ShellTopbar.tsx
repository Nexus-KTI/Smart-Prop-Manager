"use client";

import Link from "next/link";
import { Menu, PanelLeftClose } from "lucide-react";

/** Shared shell header, menu toggle left, utilities + account right. */
export function ShellTopbar({
  collapsed,
  onToggleMenu,
  utilities,
  account,
}: {
  collapsed: boolean;
  onToggleMenu: () => void;
  utilities?: React.ReactNode;
  account?: React.ReactNode;
}) {
  return (
    <header className="shell-topbar">
      <div className="shell-topbar-start">
        <button
          type="button"
          className="shell-topbar-icon-btn"
          onClick={onToggleMenu}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          {collapsed ? (
            <Menu size={20} strokeWidth={1.75} aria-hidden />
          ) : (
            <PanelLeftClose size={20} strokeWidth={1.75} aria-hidden />
          )}
        </button>
        {utilities}
      </div>
      <div className="shell-topbar-end">{account}</div>
    </header>
  );
}

export function ShellTopbarLink({
  href,
  label,
  active,
  badge,
  children,
}: {
  href: string;
  label: string;
  active?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="shell-topbar-icon-btn"
      data-active={active ? "true" : undefined}
      aria-label={badge ? `${label}, ${badge} unread` : label}
      title={label}
    >
      {children}
      {badge ? (
        <span className="shell-notifications-badge" aria-hidden>
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
