"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Settings,
  Shield,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { UserMenu, UserMenuProvider } from "@/components/UserMenu";
import { fetchAdminMe } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";
import {
  applySidebarCollapsed,
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "@/lib/sidebar";

/** Ship primary nav (+ Ops / Team when staff portfolios exist). */
const NAV_ITEMS = [
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/ops", label: "Chase ops", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  // Always false on first paint so SSR HTML matches hydration. Width CSS
  // already follows html[data-sidebar-collapsed] from the layout boot script.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const next = readSidebarCollapsed();
    setCollapsed(next);
    applySidebarCollapsed(next);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await fetchAdminMe();
        if (active) setIsAdmin(me.is_admin);
      } catch {
        if (active) setIsAdmin(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    persistSidebarCollapsed(next);
  }

  const adminActive =
    pathname === "/admin/leads" || pathname.startsWith("/admin/");

  return (
    <ToastProvider>
      <UserMenuProvider>
      <div className="app-shell">
        <aside
          className="sidebar"
          data-collapsed={collapsed}
          aria-label="Primary"
        >
          <div className="sidebar-brand">
            <span className="sidebar-brand-full">{BRAND_NAME}</span>
            <span className="sidebar-brand-mark" aria-hidden="true">
              N
            </span>
          </div>

          <nav className="sidebar-nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              // Exact or nested: /properties, /payments, /reminders, /settings
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  data-tooltip={item.label}
                  aria-label={item.label}
                >
                  <Icon className="nav-item-icon" size={20} strokeWidth={1.75} />
                  <span className="nav-item-label">{item.label}</span>
                </Link>
              );
            })}
            {isAdmin ? (
              <Link
                href="/admin/leads"
                className="nav-item"
                data-active={adminActive}
                aria-current={adminActive ? "page" : undefined}
                data-tooltip="Admin"
                aria-label="Admin"
              >
                <Shield className="nav-item-icon" size={20} strokeWidth={1.75} />
                <span className="nav-item-label">Admin</span>
              </Link>
            ) : null}
          </nav>

          <div className="sidebar-footer">
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand" : "Collapse"}
              data-tooltip={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? (
                <ChevronRight size={18} strokeWidth={1.75} />
              ) : (
                <ChevronLeft size={18} strokeWidth={1.75} />
              )}
              <span className="nav-item-label">Collapse</span>
            </button>
          </div>
        </aside>

        <div className="shell-main">
          <header className="shell-topbar">
            <UserMenu />
          </header>
          <main className="shell-content">{children}</main>
        </div>
      </div>
      </UserMenuProvider>
    </ToastProvider>
  );
}
