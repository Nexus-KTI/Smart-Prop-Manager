import type { Metadata } from "next";
import Link from "next/link";

import {
  BRAND_FULL,
  BRAND_NAME,
  BRAND_STAMP,
  BRAND_TAGLINE,
} from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

/** Public homepage only: Estate OS destination framing (PRD §4 override). */
export const metadata: Metadata = {
  title: `${BRAND_FULL} · ${BRAND_TAGLINE}`,
  description:
    "Nexora by KTI is an estate operating system for Nigerian landlords. It starts with unit money truth: who paid, who owes, what was chased. Docs, staff, access, and artisans ship in sequence. Only LIVE modules are available today.",
  openGraph: {
    title: `${BRAND_FULL} · ${BRAND_TAGLINE}`,
    description:
      "Estate operating system that starts with who paid. Money truth live today; the full map labeled LIVE / LATER.",
    type: "website",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const inviteOnly = inviteOnlySignup();

  return (
    <div className="marketing">
      <a href="#main" className="marketing-skip">
        Skip to content
      </a>
      <header className="marketing-top">
        <div className="marketing-container marketing-top-inner">
          <Link href="/" className="marketing-logo">
            <span className="marketing-logo-name">{BRAND_NAME}</span>
            <span className="marketing-logo-stamp">{BRAND_STAMP}</span>
          </Link>
          <nav className="marketing-nav" aria-label="Marketing">
            <a href="#estate-os" className="marketing-nav-link">
              Estate OS
            </a>
            <a href="#preview" className="marketing-nav-link">
              What’s live
            </a>
            <a href="#faq" className="marketing-nav-link">
              FAQ
            </a>
            <Link href="/login" className="marketing-nav-link">
              Sign in
            </Link>
            {inviteOnly ? (
              <a href="#get-started" className="btn-primary marketing-nav-cta">
                Request access
              </a>
            ) : (
              <Link href="/signup" className="btn-primary marketing-nav-cta">
                Get started
              </Link>
            )}
          </nav>
        </div>
      </header>
      {children}
      <footer className="marketing-footer">
        <div className="marketing-container marketing-footer-inner">
          <div className="marketing-footer-brand-block">
            <Link href="/" className="marketing-footer-brand">
              <span className="marketing-logo-name">{BRAND_NAME}</span>
              <span className="marketing-logo-stamp">{BRAND_STAMP}</span>
            </Link>
            <p className="marketing-footer-tag">{BRAND_TAGLINE}</p>
          </div>
          <nav className="marketing-footer-nav" aria-label="Footer">
            <a href="#estate-os">Estate OS</a>
            <a href="#preview">What’s live</a>
            <a href="#faq">FAQ</a>
            {inviteOnly ? (
              <a href="#get-started">Request access</a>
            ) : (
              <Link href="/signup">Get started</Link>
            )}
            <Link href="/login">Sign in</Link>
            <a href="#whatsapp-callback">WhatsApp</a>
          </nav>
          <p className="marketing-footer-copy">© 2026 {BRAND_FULL}</p>
        </div>
      </footer>
    </div>
  );
}
