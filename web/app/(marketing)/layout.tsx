import type { Metadata } from "next";
import Link from "next/link";

import {
  BRAND_FULL,
  BRAND_NAME,
  BRAND_STAMP,
  BRAND_TAGLINE,
} from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

/** Public marketing chrome, TenantCloud IA, Nexora NG truth. */
export const metadata: Metadata = {
  title: `${BRAND_FULL} · Who paid. Who owes. What’s next.`,
  description:
    "Nexora by KTI: who paid, who owes, what’s next. Rent and chase for Nigerian landlords: cash, transfer, Paystack, and WhatsApp.",
  openGraph: {
    title: `${BRAND_FULL} · Who paid. Who owes. What’s next.`,
    description:
      "The landlord’s daily rent-and-chase list, built for Nigerian cash, transfer, Paystack, and WhatsApp.",
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
    <div className="marketing marketing-tc">
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
            <a href="/#features" className="marketing-nav-link">
              Features
            </a>
            <a href="/#audiences" className="marketing-nav-link">
              Use cases
            </a>
            <Link href="/pricing" className="marketing-nav-link">
              Pricing
            </Link>
            <a href="/#faq" className="marketing-nav-link">
              FAQ
            </a>
            <Link href="/login" className="btn-secondary marketing-nav-login">
              Log in
            </Link>
            {inviteOnly ? (
              <a href="/#get-started" className="btn-primary marketing-nav-cta">
                Sign up
              </a>
            ) : (
              <Link href="/signup" className="btn-primary marketing-nav-cta">
                Sign up
              </Link>
            )}
          </nav>
        </div>
      </header>
      {children}
      <footer className="marketing-footer marketing-footer-tc">
        <div className="marketing-container marketing-footer-grid">
          <div className="marketing-footer-brand-block">
            <Link href="/" className="marketing-footer-brand">
              <span className="marketing-logo-name">{BRAND_NAME}</span>
              <span className="marketing-logo-stamp">{BRAND_STAMP}</span>
            </Link>
            <p className="marketing-footer-tag">{BRAND_TAGLINE}</p>
          </div>
          <nav className="marketing-footer-col" aria-label="Features">
            <p className="marketing-footer-col-title">Features</p>
            <a href="/#rent">Rent collection</a>
            <a href="/#leasing">Applications &amp; docs</a>
            <a href="/#accounting">Accounting</a>
            <a href="/#messages">Messages &amp; portal</a>
          </nav>
          <nav className="marketing-footer-col" aria-label="Use cases">
            <p className="marketing-footer-col-title">Use cases</p>
            <a href="/#features">Landlords</a>
            <Link href="/staff/claim">Property managers</Link>
            <Link href="/signup?role=tenant">Tenants</Link>
            <Link href="/artisan/claim">Service pros</Link>
          </nav>
          <nav className="marketing-footer-col" aria-label="Company">
            <p className="marketing-footer-col-title">Company</p>
            <Link href="/pricing">Pricing</Link>
            <a href="/#faq">FAQ</a>
            <a href="/#estate-os">Estate OS map</a>
            <a href="/#get-started">Get started</a>
            <a href="/#whatsapp-callback">WhatsApp callback</a>
            <Link href="/login">Log in</Link>
          </nav>
        </div>
        <div className="marketing-container">
          <p className="marketing-footer-copy">
            © 2026 {BRAND_FULL}. Property management software for Nigerian
            landlords.
          </p>
        </div>
      </footer>
    </div>
  );
}
