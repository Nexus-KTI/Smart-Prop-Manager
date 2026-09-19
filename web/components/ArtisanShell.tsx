"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
} from "lucide-react";

import { HelpFab, HelpIconButton, HelpProvider } from "@/components/HelpSheet";
import { ShellTopbar } from "@/components/ShellTopbar";
import { UserMenu, UserMenuProvider } from "@/components/UserMenu";
import { ToastProvider } from "@/components/ToastProvider";
import { BrandMark } from "@/components/BrandMark";
import { BRAND_NAME, BRAND_STAMP } from "@/lib/brand";
import { useSidebarRail } from "@/lib/use-sidebar-rail";

export function ArtisanShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    collapsed,
    peekLocked,
    toggleCollapsed,
    closeDrawer,
    unlockPeek,
    drawerOpen,
  } = useSidebarRail(pathname);
  const jobsActive = pathname === "/artisan" || pathname.startsWith("/artisan/");

  return (
    <ToastProvider>
      <UserMenuProvider>
        <HelpProvider audience="artisan">
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
              aria-label="Artisan"
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
              <nav className="sidebar-nav" aria-label="Artisan">
                <Link
                  href="/artisan"
                  className="nav-item"
                  data-active={jobsActive ? "true" : undefined}
                  aria-current={jobsActive ? "page" : undefined}
                  data-tooltip="Your jobs"
                  aria-label="Your jobs"
                >
                  <ListChecks
                    className="nav-item-icon"
                    size={20}
                    strokeWidth={1.75}
                  />
                  <span className="nav-item-label">Your jobs</span>
                </Link>
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
                utilities={<HelpIconButton />}
                account={<UserMenu settingsHref="/artisan" />}
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
