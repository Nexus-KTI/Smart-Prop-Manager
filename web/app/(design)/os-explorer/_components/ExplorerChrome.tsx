"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { mockSessionUser, mockUnitRows } from "../mock/data";

const PHASE_LINKS = [
  { href: "/os-explorer", label: "Hub" },
  { href: "/os-explorer/phase-1", label: "Phase 1 · Money" },
  { href: "/os-explorer/phase-2", label: "Phase 2 · Bills" },
  { href: "/os-explorer/phase-3", label: "Phase 3 · Docs & pay" },
  { href: "/os-explorer/phase-4", label: "Phase 4 · Staff" },
  { href: "/os-explorer/phase-5", label: "Phase 5 · Access" },
];

const PHASE1_RAIL = [
  { href: "/os-explorer/phase-1", label: "Today", exact: true },
  { href: "/os-explorer/phase-1/portfolio", label: "Properties" },
  { href: "/os-explorer/phase-1/payments", label: "Payments" },
  { href: "/os-explorer/phase-1/reminders", label: "Reminders" },
  { href: "/os-explorer/phase-1/tenancies", label: "Tenancies" },
  { href: "/os-explorer/phase-1/expenses", label: "Expenses" },
  { href: "/os-explorer/phase-1/reports", label: "Reports" },
  { href: "/os-explorer/phase-1/settings", label: "Settings" },
  { href: "/os-explorer/phase-1/help", label: "Help" },
];

function WireBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const overdue = mockUnitRows().filter(
    (u) => u.status === "OVERDUE" && !u.needsUnit,
  ).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="osx-bell" ref={rootRef}>
      <button
        type="button"
        className="osx-bell-btn"
        aria-expanded={open}
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        Bell
        {overdue > 0 ? (
          <span className="osx-bell-count" aria-hidden>
            {overdue}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="osx-bell-panel" role="menu">
          <p className="osx-bell-title">Notifications</p>
          {overdue > 0 ? (
            <Link
              href="/os-explorer/phase-1/reminders"
              className="osx-bell-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <strong>Units overdue</strong>
              <span>
                {overdue} unit{overdue === 1 ? "" : "s"} need chase → Reminders
              </span>
            </Link>
          ) : (
            <p className="osx-muted" style={{ margin: 0, padding: "8px 12px" }}>
              No overdue units.
            </p>
          )}
          <Link
            href="/os-explorer/phase-1/reminders"
            className="osx-bell-footer"
            onClick={() => setOpen(false)}
          >
            Open Reminders
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function WireAccount({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const user = mockSessionUser;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={compact ? "osx-account osx-account-compact" : "osx-account"}
      ref={rootRef}
    >
      <button
        type="button"
        className="osx-account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.name}, account menu`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="osx-account-avatar" aria-hidden>
          {user.initials}
        </span>
        {compact ? null : (
          <span className="osx-account-meta">
            <span className="osx-account-name">{user.name}</span>
            <span className="osx-account-role">{user.role}</span>
          </span>
        )}
      </button>
      {open ? (
        <div
          className="osx-account-panel"
          role="menu"
          data-align={compact ? "end" : "start"}
        >
          <div className="osx-account-identity">
            <p className="osx-account-role">{user.role}</p>
            <p className="osx-account-name">{user.name}</p>
            <p className="osx-muted" style={{ margin: 0 }}>
              {user.email}
            </p>
          </div>
          <Link
            href="/os-explorer/phase-1/settings"
            className="osx-account-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <Link
            href="/os-explorer?logged_out=1"
            className="osx-account-item osx-account-logout"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Log out
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function ExplorerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onPhase1 =
    pathname === "/os-explorer/phase-1" ||
    pathname.startsWith("/os-explorer/phase-1/");

  return (
    <div className="osx-root">
      <div className="osx-banner">
        <strong>Wireframe explorer</strong> · mock data · not production ·
        Nexora by KTI
        <span className="osx-banner-actions">
          <WireBell />
          <WireAccount compact />
        </span>
      </div>
      <div className="osx-shell">
        <nav className="osx-nav" aria-label="OS explorer phases">
          <Link href="/os-explorer" className="osx-brand">
            Nexora
            <span>Wireframe explorer</span>
          </Link>
          <div className="osx-nav-label">Phases</div>
          {PHASE_LINKS.map((item) => {
            const active =
              item.href === "/os-explorer"
                ? pathname === "/os-explorer"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active ? "true" : "false"}
              >
                {item.label}
              </Link>
            );
          })}
          {onPhase1 ? (
            <>
              <div className="osx-nav-label">Phase 1 rail</div>
              {PHASE1_RAIL.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-active={active ? "true" : "false"}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </>
          ) : null}

          <div className="osx-nav-account">
            <div className="osx-nav-label">Signed in</div>
            <WireAccount />
          </div>
        </nav>
        <main className="osx-main">{children}</main>
      </div>
    </div>
  );
}
