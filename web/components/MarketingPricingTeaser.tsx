import Link from "next/link";

import { inviteOnlySignup } from "@/lib/invite";

/** TenantCloud-style pricing cards, honest NG ₦0 today / paid later. */
export function MarketingPricingTeaser() {
  const inviteOnly = inviteOnlySignup();

  return (
    <div className="marketing-pricing-teaser">
      <div className="marketing-pricing-card" data-emphasis="true">
        <p className="marketing-pricing-badge">Most popular</p>
        <h3 className="marketing-pricing-name">
          {inviteOnly ? "Invite beta" : "Starter"}
        </h3>
        <p className="marketing-pricing-price">
          ₦0<span className="marketing-pricing-period">/mo</span>
        </p>
        <p className="marketing-pricing-meta">
          {inviteOnly
            ? "Invite beta, rent and chase with no hard paywall."
            : "First property free, rent and chase with no hard paywall."}
        </p>
        <ul className="marketing-pricing-list">
          <li>Online + manual rent payments</li>
          <li>Maintenance management</li>
          <li>Applications & tenant portal</li>
          <li>Messages hub</li>
        </ul>
        {inviteOnly ? (
          <a href="#get-started" className="btn-primary">
            Start free
          </a>
        ) : (
          <Link href="/signup" className="btn-primary">
            Start free
          </Link>
        )}
      </div>
      <div className="marketing-pricing-card">
        <p className="marketing-pricing-badge">Later</p>
        <h3 className="marketing-pricing-name">Growth & Pro</h3>
        <p className="marketing-pricing-price">TBD</p>
        <p className="marketing-pricing-meta">
          Advanced tools when we open public billing, team seats, deeper books,
          partner identity checks.
        </p>
        <ul className="marketing-pricing-list">
          <li>Everything in Starter</li>
          <li>Team seats & scopes</li>
          <li>Deeper accounting & bank feeds</li>
          <li>Partner identity verify (NIN/BVN)</li>
        </ul>
        <Link href="/#get-started" className="btn-secondary">
          Talk to us
        </Link>
      </div>
    </div>
  );
}
