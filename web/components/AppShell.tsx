"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Ellipsis,
  FileText,
  ListChecks,
  Megaphone,
  MessageSquare,
  Receipt,
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
import { BrandMark } from "@/components/BrandMark";
import { BRAND_NAME, BRAND_STAMP } from "@/lib/brand";
import {
  formatUnreadBadge,
  useMessageUnreadCount,
} from "@/lib/use-message-unread";
import { useSidebarRail } from "@/lib/use-sidebar-rail";
import { useUrgentActionsCount } from "@/lib/use-urgent-actions-count";
import { useApplicationsPendingCount } from "@/lib/use-applications-pending-count";
import { useWorkOrdersOpenCount } from "@/lib/use-work-orders-open-count";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Building2;
};

/** Intentional landlord rail (layout 3.2): daily path, always visible.
 *  Primary: Properties, Tenancies, Payments, Action needed, Messages,
 *  Applications, Work orders (+ Admin when allowed).
 *  Header bell = interrupt summary only; rail uses CircleAlert (not Bell).
 *  Settings lives in the account menu — not on this rail. */
const NAV_PRIMARY: NavItem[] = [
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/tenancies", label: "Tenancies", icon: Users },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/reminders", label: "Action needed", icon: CircleAlert },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/work-orders", label: "Work orders", icon: ListChecks },
];

/** Secondary destinations under More (layout 3.2).
 *  Expenses, Reports, To-dos, Bulletin, Gate codes.
 *  No Fees / Documents / Inventory hubs. Across-owner chase = /ops
 *  (linked from Action needed / Team), not the rail.
 *  To-dos ≠ Work orders; Gate codes ≠ Applications. */
const NAV_MORE: NavItem[] = [
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/tasks", label: "To-dos", icon: CalendarDays },
  { href: "/publications", label: "Bulletin", icon: Megaphone },
  { href: "/access", label: "Gate codes", icon: Shield },
];

function pathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const {
    collapsed,
    peekLocked,
    toggleCollapsed,
    closeDrawer,
    unlockPeek,
    drawerOpen,
  } = useSidebarRail(pathname);
  const morePathActive = useMemo(
    () => NAV_MORE.some((item) => pathActive(pathname, item.href)),
    [pathname],
  );
  const [morePinnedOpen, setMorePinnedOpen] = useState(false);
  const moreOpen = morePathActive || morePinnedOpen;
  const messageUnread = useMessageUnreadCount();
  const urgentActions = useUrgentActionsCount();
  const applicationsPending = useApplicationsPendingCount();
  const workOrdersOpen = useWorkOrdersOpenCount();

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

  const adminActive =
    pathname === "/admin/leads" || pathname.startsWith("/admin/");

  function renderNavLink(item: NavItem) {
    const active = pathActive(pathname, item.href);
    const Icon = item.icon;
    const isMessages = item.href === "/messages";
    const isReminders = item.href === "/reminders";
    const isApplications = item.href === "/applications";
    const isWorkOrders = item.href === "/work-orders";
    const badgeCount = isMessages
      ? messageUnread
      : isReminders
        ? urgentActions
        : isApplications
          ? applicationsPending
          : isWorkOrders
            ? workOrdersOpen
            : 0;
    const badge = formatUnreadBadge(badgeCount);
    const badgeAria = isMessages
      ? `${item.label}, ${messageUnread} unread`
      : isReminders
        ? `${item.label}, ${urgentActions} action needed`
        : isApplications
          ? `${item.label}, ${applicationsPending} pending`
          : isWorkOrders
            ? `${item.label}, ${workOrdersOpen} open`
            : item.label;
    return (
      <Link
        key={item.href}
        href={item.href}
        className="nav-item"
        data-active={active}
        aria-current={active ? "page" : undefined}
        data-tooltip={item.label}
        aria-label={badge ? badgeAria : item.label}
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
        {drawerOpen ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close menu"
            onClick={closeDrawer}
          />
        ) : null}
        <aside
          className="sidebar"
          data-collapsed={collapsed}
          data-peek-locked={peekLocked ? "true" : undefined}
          aria-label="Primary"
          onMouseLeave={unlockPeek}
        >
          <div className="sidebar-brand">
            <span className="sidebar-brand-lockup">
              <span className="sidebar-brand-mark" aria-hidden="true">
                <BrandMark size={22} />
              </span>
              <span className="sidebar-brand-text">
                <span className="sidebar-brand-name">{BRAND_NAME}</span>
                <span className="sidebar-brand-stamp">{BRAND_STAMP}</span>
              </span>
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
                onClick={() => setMorePinnedOpen((open) => !open)}
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
