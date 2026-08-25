"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PHASE_LINKS = [
  { href: "/os-explorer", label: "Hub" },
  { href: "/os-explorer/phase-1", label: "Phase 1 · Money" },
  { href: "/os-explorer/phase-2", label: "Phase 2 · Bills" },
  { href: "/os-explorer/phase-3", label: "Phase 3 · Docs & pay" },
  { href: "/os-explorer/phase-4", label: "Phase 4 · Staff" },
  { href: "/os-explorer/phase-5", label: "Phase 5 · Access" },
];

export function ExplorerChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="osx-root">
      <div className="osx-banner">
        <strong>Wireframe explorer</strong> · mock data · not production ·
        Nexora by KTI
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
        </nav>
        <main className="osx-main">{children}</main>
      </div>
    </div>
  );
}
