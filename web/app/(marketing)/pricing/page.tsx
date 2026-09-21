import type { Metadata } from "next";
import Link from "next/link";

import { MarketingCtaSection } from "@/components/MarketingCtaSection";
import { MarketingFaq } from "@/components/MarketingFaq";
import { MarketingPricingTeaser } from "@/components/MarketingPricingTeaser";
import { MarketingSection } from "@/components/MarketingSection";
import { MarketingStickyCta } from "@/components/MarketingStickyCta";
import { BRAND_FULL, BRAND_NAME } from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

export const metadata: Metadata = {
  title: `Plans & Pricing · ${BRAND_FULL}`,
  description:
    "Nexora Estate OS pricing for Nigerian landlords. Free or invite beta today - Growth & Pro later when public billing opens.",
};

export default function PricingPage() {
  const inviteOnly = inviteOnlySignup();
  const primaryLabel = inviteOnly ? "Request access" : "Start free";
  const primaryHref = inviteOnly ? "#get-started" : "/signup";

  const faqs = [
    {
      question: "Which plan is best for me?",
      answer: inviteOnly
        ? "Start with invite beta once approved - full LIVE Estate OS with no hard paywall. Growth & Pro open when we publish paid plans."
        : "Start free with your first property. Upgrade later when Growth & Pro open for team seats, bank feeds, and partner identity checks.",
    },
    {
      question: "Is there a free plan?",
      answer: inviteOnly
        ? "Invite beta is free once approved. There is no hard paywall in the product today."
        : "Yes - free to start with your first property. No subscription wall on first run.",
    },
    {
      question: "What’s included today?",
      answer: `${BRAND_NAME} Estate OS LIVE today: money & chase, occupancy (applications, renewals), tenant portal, messages, work orders & artisans, access, staff scopes, expenses, and rent roll. Docs & acknowledge, bank feeds, and NIN/BVN checks are Later.`,
    },
    {
      question: "Do tenants pay fees?",
      answer:
        "Paystack processing fees follow Paystack’s rates when tenants pay online. Cash and transfer stay free to record.",
    },
    {
      question: "Can multiple team members use the same account?",
      answer:
        "Invite staff with scoped permissions instead of sharing the landlord login. Deeper team seats ship with Growth & Pro later.",
    },
  ];

  return (
    <main className="marketing-main marketing-lean" id="main">
      <MarketingSection
        id="plans"
        headingId="plans-heading"
        title="Plans & pricing"
        lede="Estate OS for Nigerian landlords - start free, pay later when the portfolio asks."
      >
        <p className="marketing-pricing-social">
          Cash, transfer, card, WhatsApp. Same unit truth as the homepage.
        </p>
        <MarketingPricingTeaser primaryLabel={primaryLabel} />
        <p className="marketing-pricing-footnote">
          <Link href="/#product" className="table-link">
            See what’s live on the homepage →
          </Link>
        </p>
      </MarketingSection>

      <MarketingSection
        id="pricing-faq"
        headingId="pricing-faq-heading"
        title="Questions"
        lede="Short answers on plans and what’s LIVE."
        alt
      >
        <MarketingFaq items={faqs} />
      </MarketingSection>

      <MarketingSection
        id="get-started"
        headingId="pricing-cta-heading"
        title={primaryLabel}
        lede={
          inviteOnly
            ? "Closed beta. WhatsApp us, or ask for a callback."
            : "Landlord account in minutes - or ask us to reach you on WhatsApp."
        }
        className="marketing-cta"
      >
        <MarketingCtaSection inviteOnly={inviteOnly} />
      </MarketingSection>

      <MarketingStickyCta label={primaryLabel} href={primaryHref} />
    </main>
  );
}
