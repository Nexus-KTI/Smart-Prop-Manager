"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LineChart,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ToastProvider } from "@/components/ToastProvider";
import { UserMenu, UserMenuProvider } from "@/components/UserMenu";
import { BRAND_NAME } from "@/lib/brand";
import {
  applySidebarCollapsed,
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "@/lib/sidebar";

const NAV_ITEMS = [
  { href: "/admin/leads", label: "Access requests", icon: Inbox },
  { href: "/admin/phase2-exit", label: "Phase 2 exit", icon: LineChart },
  { href: "/admin/phase3-exit", label: "Phase 3 exit", icon: LineChart },
  { href: "/admin/phase4-exit", label: "Phase 4 exit", icon: LineChart },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Always false on first paint so SSR HTML matches hydration. Width CSS
  // already follows html[data-sidebar-collapsed] from the layout boot script.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const next = readSidebarCollapsed();
    setCollapsed(next);
    applySidebarCollapsed(next);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    persistSidebarCollapsed(next);
  }

  return (
    <ToastProvider>
      <UserMenuProvider>
      <div className="app-shell">
        <aside
          className="sidebar"
          data-collapsed={collapsed}
          aria-label="Admin"
        >
          <div className="sidebar-brand">
            <span className="sidebar-brand-full">{BRAND_NAME} Admin</span>
            <span className="sidebar-brand-mark" aria-hidden="true">
              N
            </span>
          </div>

          <nav className="sidebar-nav" aria-label="Admin">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  data-active={active}
                  data-tooltip={item.label}
                  aria-label={item.label}
                >
                  <Icon className="nav-item-icon" size={20} strokeWidth={1.75} />
                  <span className="nav-item-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <Link
              href="/properties"
              className="nav-item"
              data-tooltip="Landlord app"
              aria-label="Landlord app"
            >
              <Building2 className="nav-item-icon" size={20} strokeWidth={1.75} />
              <span className="nav-item-label">Landlord app</span>
            </Link>

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
