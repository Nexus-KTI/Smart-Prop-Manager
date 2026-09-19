import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { MarketingFooterSocial } from "@/components/MarketingFooterSocial";
import { MarketingHeader } from "@/components/MarketingHeader";
import {
  BRAND_ASSETS,
  BRAND_FULL,
  BRAND_NAME,
  BRAND_STAMP,
  BRAND_TAGLINE,
} from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

/** Public marketing chrome - Estate OS homepage may use full OS language. */
export const metadata: Metadata = {
  title: `${BRAND_FULL} · Estate OS for Nigerian landlords`,
  description:
    "Nexora by KTI: Estate OS for Nigerian landlords - money, tenancies, messages, repairs, access, staff, and books. Who paid. Who owes. What’s next.",
  openGraph: {
    title: `${BRAND_FULL} · Estate OS for Nigerian landlords`,
    description:
      "Unit truth for rent and chase, plus tenancies, messages, work orders, access, and staff - cash, transfer, card, WhatsApp.",
    type: "website",
    images: [{ url: BRAND_ASSETS.appIcon }],
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
      <MarketingHeader inviteOnly={inviteOnly} />
      {children}
      <footer className="marketing-footer marketing-footer-tc">
        <div className="marketing-container marketing-footer-grid">
          <div className="marketing-footer-brand-block">
            <Link href="/" className="marketing-footer-brand marketing-logo">
              <span className="marketing-logo-mark" aria-hidden="true">
                <BrandMark size={24} />
              </span>
              <span className="marketing-logo-text">
                <span className="marketing-logo-name">{BRAND_NAME}</span>
                <span className="marketing-logo-stamp">{BRAND_STAMP}</span>
              </span>
            </Link>
            <p className="marketing-footer-tag">{BRAND_TAGLINE}</p>
            <MarketingFooterSocial />
          </div>
          <nav className="marketing-footer-col" aria-label="Product">
            <p className="marketing-footer-col-title">Product</p>
            <Link href="/#product">What’s live</Link>
            <Link href="/#audiences">Roles</Link>
            <Link href="/pricing">Pricing</Link>
          </nav>
          <nav className="marketing-footer-col" aria-label="Roles">
            <p className="marketing-footer-col-title">Roles</p>
            <Link href="/#audiences">Landlords</Link>
            <Link href="/staff/claim">Property managers</Link>
            <Link href="/signup?role=tenant">Tenants</Link>
            <Link href="/artisan/claim">Service pros</Link>
          </nav>
          <nav className="marketing-footer-col" aria-label="Company">
            <p className="marketing-footer-col-title">Company</p>
            <Link href="/#faq">FAQ</Link>
            <Link href="/#get-started">Get started</Link>
            <Link href="/#whatsapp-callback">WhatsApp callback</Link>
            <Link href="/login">Log in</Link>
          </nav>
        </div>
        <div className="marketing-container">
          <div className="marketing-footer-copy">
            <p>© 2026 {BRAND_FULL}.</p>
            <p>Estate OS for Nigerian landlords.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
