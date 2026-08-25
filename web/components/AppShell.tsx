"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  ListChecks,
  Megaphone,
  MessageSquare,
  Receipt,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { HelpFab, HelpIconButton, HelpProvider } from "@/components/HelpSheet";
import { ShellTopbar } from "@/components/ShellTopbar";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ToastProvider } from "@/components/ToastProvider";
import { UserMenu, UserMenuProvider } from "@/components/UserMenu";
import { fetchAdminMe } from "@/lib/api";
import { BRAND_NAME } from "@/lib/brand";
import {
  applySidebarCollapsed,
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "@/lib/sidebar";
import {
  formatUnreadBadge,
  useMessageUnreadCount,
} from "@/lib/use-message-unread";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Building2;
};

/** Daily landlord path, always visible. */
const NAV_PRIMARY: NavItem[] = [
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/tenancies", label: "Tenancies", icon: Users },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/work-orders", label: "Work orders", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Secondary destinations, under More until needed. */
const NAV_MORE: NavItem[] = [
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/tasks", label: "Tasks", icon: CalendarDays },
  { href: "/publications", label: "Bulletin", icon: Megaphone },
  { href: "/access", label: "Access", icon: Shield },
  { href: "/ops", label: "Chase ops", icon: ListChecks },
];

function pathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  // Always false on first paint so SSR HTML matches hydration. Width CSS
  // already follows html[data-sidebar-collapsed] from the layout boot script.
  const [collapsed, setCollapsed] = useState(false);
  const [peekLocked, setPeekLocked] = useState(false);
  const morePathActive = useMemo(
    () => NAV_MORE.some((item) => pathActive(pathname, item.href)),
    [pathname],
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const messageUnread = useMessageUnreadCount();

  useEffect(() => {
    const next = readSidebarCollapsed();
    setCollapsed(next);
    applySidebarCollapsed(next);
  }, []);

  useEffect(() => {
    if (morePathActive) setMoreOpen(true);
  }, [morePathActive]);

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
    // Lock peek until the pointer leaves, otherwise hover re-expands immediately.
    if (next) setPeekLocked(true);
    else setPeekLocked(false);
  }

  const adminActive =
    pathname === "/admin/leads" || pathname.startsWith("/admin/");

  function renderNavLink(item: NavItem) {
    const active = pathActive(pathname, item.href);
    const Icon = item.icon;
    const isMessages = item.href === "/messages";
    const badge = isMessages ? formatUnreadBadge(messageUnread) : "";
    return (
      <Link
        key={item.href}
        href={item.href}
        className="nav-item"
        data-active={active}
        aria-current={active ? "page" : undefined}
        data-tooltip={item.label}
        aria-label={
          badge
            ? `${item.label}, ${messageUnread} unread`
            : item.label
        }
      >
        <span className="nav-item-icon-wrap">
          <Icon className="nav-item-icon" size={20} strokeWidth={1.75} />
          {badge ? (
            <span className="nav-item-badge" aria-hidden>
              {badge}
            </span>
          ) : null}
        </span>
        <span className="nav-item-label">{item.label}</span>
      </Link>
    );
  }

  return (
    <ToastProvider>
      <UserMenuProvider>
      <HelpProvider audience="landlord">
      <div className="app-shell">
        <aside
          className="sidebar"
          data-collapsed={collapsed}
          data-peek-locked={peekLocked ? "true" : undefined}
          aria-label="Primary"
          onMouseLeave={() => setPeekLocked(false)}
        >
          <div className="sidebar-brand">
            <span className="sidebar-brand-full">{BRAND_NAME}</span>
            <span className="sidebar-brand-mark" aria-hidden="true">
              N
            </span>
          </div>

          <nav className="sidebar-nav" aria-label="Primary">
            {NAV_PRIMARY.map(renderNavLink)}

            <div className="sidebar-more">
              <button
                type="button"
                className="sidebar-more-toggle"
                data-open={moreOpen}
                data-tooltip={moreOpen ? "Less" : "More"}
                aria-expanded={moreOpen}
                aria-controls="sidebar-more-items"
                onClick={() => setMoreOpen((open) => !open)}
              >
                {moreOpen ? (
                  <ChevronDown
                    className="nav-item-icon"
                    size={20}
                    strokeWidth={1.75}
                  />
                ) : (
                  <Ellipsis
                    className="nav-item-icon"
                    size={20}
                    strokeWidth={1.75}
                  />
                )}
                <span className="nav-item-label">
                  {moreOpen ? "Less" : "More"}
                </span>
              </button>
              {moreOpen ? (
                <div
                  id="sidebar-more-items"
                  className="sidebar-more-items"
                  role="group"
                  aria-label="More destinations"
                >
                  {NAV_MORE.map(renderNavLink)}
                </div>
              ) : null}
            </div>

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
          <ShellTopbar
            collapsed={collapsed}
            onToggleMenu={toggleCollapsed}
            utilities={
              <>
                <NotificationsBell audience="landlord" />
                <HelpIconButton />
              </>
            }
            account={<UserMenu settingsHref="/settings" />}
          />
          <main className="shell-content">{children}</main>
        </div>
        <HelpFab />
      </div>
      </HelpProvider>
      </UserMenuProvider>
    </ToastProvider>
  );
}
