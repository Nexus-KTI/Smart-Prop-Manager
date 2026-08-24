"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserMenu, UserMenuProvider } from "@/components/UserMenu";
import { ToastProvider } from "@/components/ToastProvider";
import { BRAND_NAME } from "@/lib/brand";

const NAV = [
  { href: "/tenant", label: "Your rent" },
  { href: "/tenant/receipts", label: "Receipts" },
  { href: "/tenant/documents", label: "Documents" },
] as const;

export function TenantShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ToastProvider>
      <UserMenuProvider>
        <div className="app-shell">
          <aside className="sidebar" aria-label="Tenant">
            <div className="sidebar-brand">
              <span className="sidebar-brand-full">{BRAND_NAME}</span>
              <span className="sidebar-brand-mark" aria-hidden="true">
                N
              </span>
            </div>
            <nav className="sidebar-nav" aria-label="Tenant">
              {NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/tenant" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-item"
                    data-active={active ? "true" : undefined}
                  >
                    <span className="nav-item-label">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="sidebar-footer">
              <UserMenu />
            </div>
          </aside>
          <main className="shell-main">
            <div className="shell-content">{children}</div>
          </main>
        </div>
      </UserMenuProvider>
    </ToastProvider>
  );
}
