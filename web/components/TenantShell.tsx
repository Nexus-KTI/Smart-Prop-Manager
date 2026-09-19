"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  Home,
  KeyRound,
  ListChecks,
  Megaphone,
  MessageSquare,
  Receipt,
  Shield,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

import { HelpFab, HelpIconButton, HelpProvider } from "@/components/HelpSheet";
import { ShellTopbar } from "@/components/ShellTopbar";
import { NotificationsBell } from "@/components/NotificationsBell";
import { UserMenu, UserMenuProvider } from "@/components/UserMenu";
import { ToastProvider } from "@/components/ToastProvider";
import { BrandMark } from "@/components/BrandMark";
import { BRAND_NAME, BRAND_STAMP } from "@/lib/brand";
import {
  formatUnreadBadge,
  useMessageUnreadCount,
} from "@/lib/use-message-unread";
import { useSidebarRail } from "@/lib/use-sidebar-rail";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
};

/** Daily tenant jobs, always visible (Messages in rail, same as landlord). */
const NAV_PRIMARY: NavItem[] = [
  { href: "/tenant", label: "Home", icon: Home },
  { href: "/tenant/fees", label: "Fees", icon: Wallet },
  { href: "/tenant/requests", label: "Requests", icon: Wrench },
  { href: "/tenant/messages", label: "Messages", icon: MessageSquare },
  { href: "/tenant/utilities", label: "Utilities", icon: Zap },
  { href: "/tenant/documents", label: "Documents", icon: FileText },
  { href: "/tenant/access", label: "Gate codes", icon: KeyRound },
];

/** Secondary destinations, under More until needed. Settings lives in the account menu. */
const NAV_MORE: NavItem[] = [
  { href: "/tenant/notices", label: "Notices", icon: Megaphone },
  { href: "/tenant/claim", label: "Claim invite", icon: Shield },
  { href: "/tenant/receipts", label: "Receipts", icon: Receipt },
  { href: "/tenant/tasks", label: "To-dos", icon: ListChecks },
];

function pathActive(pathname: string, href: string): boolean {
  if (href === "/tenant") return pathname === "/tenant";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TenantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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

  function renderNavLink(item: NavItem) {
    const active = pathActive(pathname, item.href);
    const Icon = item.icon;
    const isMessages = item.href === "/tenant/messages";
    const badge = isMessages ? formatUnreadBadge(messageUnread) : "";
    return (
      <Link
        key={item.href}
        href={item.href}
        className="nav-item"
        data-active={active ? "true" : undefined}
        aria-current={active ? "page" : undefined}
        data-tooltip={item.label}
        aria-label={
          badge ? `${item.label}, ${messageUnread} unread` : item.label
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
        <HelpProvider audience="tenant">
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
              aria-label="Tenant"
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
              <nav className="sidebar-nav" aria-label="Tenant">
                {NAV_PRIMARY.map(renderNavLink)}

                <div className="sidebar-more">
                  <button
                    type="button"
                    className="sidebar-more-toggle"
                    data-open={moreOpen}
                    data-tooltip={moreOpen ? "Less" : "More"}
                    aria-expanded={moreOpen}
                    aria-controls="tenant-sidebar-more-items"
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
                      id="tenant-sidebar-more-items"
                      className="sidebar-more-items"
                      role="group"
                      aria-label="More destinations"
                    >
                      {NAV_MORE.map(renderNavLink)}
                    </div>
                  ) : null}
                </div>
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
                    <NotificationsBell audience="tenant" />
                    <HelpIconButton />
                  </>
                }
                account={<UserMenu settingsHref="/tenant/settings" />}
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
