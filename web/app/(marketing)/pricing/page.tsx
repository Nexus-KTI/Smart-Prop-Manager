import type { Metadata } from "next";
import Link from "next/link";

import { MarketingCtaSection } from "@/components/MarketingCtaSection";
import { MarketingFaq } from "@/components/MarketingFaq";
import { MarketingPricingTeaser } from "@/components/MarketingPricingTeaser";
import { MarketingSection } from "@/components/MarketingSection";
import { BRAND_FULL, BRAND_NAME } from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

export const metadata: Metadata = {
  title: `Plans & Pricing · ${BRAND_FULL}`,
  description:
    "Nexora pricing that scales with your portfolio. Free or invite beta today, paid plans when we open public billing.",
};

export default function PricingPage() {
  const inviteOnly = inviteOnlySignup();

  const faqs = [
    {
      question: "Which plan is best for me?",
      answer: inviteOnly
        ? "Start with invite beta once approved, full LIVE tools with no hard paywall. Upgrade path opens when paid plans publish."
        : "Start free with your first property. Upgrade later when paid plans open for team seats, deeper books, and partner identity checks.",
    },
    {
      question: "Is there a free plan?",
      answer: inviteOnly
        ? "Invite beta is free once approved. There is no hard paywall in the product today."
        : "Yes, free to start with your first property. No subscription wall on first run.",
    },
    {
      question: "What’s included today?",
      answer: `${BRAND_NAME} includes rent & chase, tenant portal, messages, maintenance, access/artisans, expenses, applications, and rent roll, as labeled LIVE on the homepage map.`,
    },
    {
      question: "Do tenants pay fees?",
      answer:
        "Paystack processing fees follow Paystack’s rates when tenants pay online. Cash and transfer stay free to record.",
    },
    {
      question: "Can multiple team members use the same account?",
      answer:
        "Invite staff with scoped permissions instead of sharing the landlord login. Deeper team seats ship with paid plans later.",
    },
  ];

  return (
    <main className="marketing-main" id="main">
      <MarketingSection
        id="plans"
        headingId="plans-heading"
        title="Plans & pricing"
        lede="Pricing that scales with your portfolio, from a single unit to a full estate."
      >
        <p className="marketing-pricing-social">
          Built for Nigerian landlords, cash, transfer, Paystack, and WhatsApp
          chase.
        </p>
        <MarketingPricingTeaser />
        <p className="marketing-pricing-footnote">
          <Link href="/#estate-os" className="table-link">
            Compare LIVE features on the homepage map →
          </Link>
        </p>
      </MarketingSection>

      <MarketingSection
        id="pricing-faq"
        headingId="pricing-faq-heading"
        title="FAQs"
        lede="Product & plans answers."
        alt
      >
        <MarketingFaq items={faqs} />
      </MarketingSection>

      <MarketingSection
        id="get-started"
        headingId="pricing-cta-heading"
        title="Request a demo"
        lede={
          inviteOnly
            ? "See how Nexora organizes rent and chase. Tell us how to reach you, we’ll set up a quick call or send an invite."
            : "See how Nexora organizes rent and chase. Create an account, or ask us to reach you on WhatsApp."
        }
        className="marketing-cta"
      >
        <MarketingCtaSection inviteOnly={inviteOnly} />
      </MarketingSection>
    </main>
  );
}
