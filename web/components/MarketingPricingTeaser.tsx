import Link from "next/link";

import { inviteOnlySignup } from "@/lib/invite";

type Props = {
  /** Override primary CTA label (matches homepage). */
  primaryLabel?: string;
};

/** Honest NG pricing: ₦0 Estate OS today, Growth/Pro labeled Later. */
export function MarketingPricingTeaser({ primaryLabel }: Props = {}) {
  const inviteOnly = inviteOnlySignup();
  const ctaLabel =
    primaryLabel ?? (inviteOnly ? "Request access" : "Start free");
  const primaryHref = inviteOnly ? "#get-started" : "/signup";

  return (
    <div className="marketing-pricing-teaser">
      <div className="marketing-pricing-card" data-emphasis="true">
        <p className="marketing-pricing-badge">Live today</p>
        <h3 className="marketing-pricing-name">
          {inviteOnly ? "Invite beta" : "Starter"}
        </h3>
        <p className="marketing-pricing-price">
          ₦0<span className="marketing-pricing-period">/mo</span>
        </p>
        <p className="marketing-pricing-meta">
          {inviteOnly
            ? "Full Estate OS once approved - no hard paywall."
            : "First property free. Full Estate OS - no hard paywall."}
        </p>
        <ul className="marketing-pricing-list">
          <li>Money &amp; chase (cash, transfer, card)</li>
          <li>Occupancy: applications, renewals (docs Later)</li>
          <li>Portal, messages, work orders &amp; artisans</li>
          <li>Access passes, staff scopes, expenses &amp; rent roll</li>
        </ul>
        {primaryHref.startsWith("#") ? (
          <a href={primaryHref} className="btn-primary">
            {ctaLabel}
          </a>
        ) : (
          <Link href={primaryHref} className="btn-primary">
            {ctaLabel}
          </Link>
        )}
      </div>
      <div className="marketing-pricing-card">
        <p className="marketing-pricing-badge">Later</p>
        <h3 className="marketing-pricing-name">Growth &amp; Pro</h3>
        <p className="marketing-pricing-price">TBD</p>
        <p className="marketing-pricing-meta">
          When we open public billing - team seats, deeper books, partner
          identity checks. Labeled Later, not sold as live.
        </p>
        <ul className="marketing-pricing-list">
          <li>Everything in {inviteOnly ? "Invite beta" : "Starter"}</li>
          <li>Team seats &amp; deeper scopes</li>
          <li>Bank feeds / statement reconciliation</li>
          <li>Partner identity verify (NIN/BVN)</li>
        </ul>
        <a href="#get-started" className="btn-secondary">
          Talk to us
        </a>
      </div>
    </div>
  );
}
