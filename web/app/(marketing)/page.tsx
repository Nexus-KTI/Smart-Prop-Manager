import Link from "next/link";

import { MarketingAudiences } from "@/components/MarketingAudiences";
import { MarketingCtaSection } from "@/components/MarketingCtaSection";
import { MarketingFaq } from "@/components/MarketingFaq";
import { MarketingFeatureBlocks } from "@/components/MarketingFeatureBlocks";
import { MarketingHeroFrame } from "@/components/MarketingHeroFrame";
import { MarketingPricingTeaser } from "@/components/MarketingPricingTeaser";
import { MarketingSection } from "@/components/MarketingSection";
import { MarketingTestimonials } from "@/components/MarketingTestimonials";
import { MarketingTrustStrip } from "@/components/MarketingTrustStrip";
import { MarketingVisionSection } from "@/components/MarketingVisionSection";
import {
  BRAND_NAME,
  BRAND_STAMP,
  BRAND_TAGLINE,
} from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

export default function MarketingPage() {
  const inviteOnly = inviteOnlySignup();

  const faqs = [
    {
      question: `What is ${BRAND_NAME}?`,
      answer: `The landlord’s daily list for rent and chase, built for Nigerian cash, transfer, Paystack, and WhatsApp. Docs, messages, and estate tools grow from the same unit.`,
    },
    {
      question: "Why not spreadsheets and chats?",
      answer:
        "Private threads lose paid/overdue status. Nexora keeps the trail on one list so Friday chase doesn’t eat the night.",
    },
    {
      question: "Who can use it?",
      answer:
        "Landlords and managers run the portfolio. Tenants, staff, and artisans enter by invite, each with the right door.",
    },
    {
      question: "How much does it cost?",
      answer: inviteOnly
        ? "Invite beta is free once approved. Paid plans come later. See Pricing."
        : "Free to start with your first property. Paid plans come later. See Pricing.",
    },
    {
      question: "Is everything live today?",
      answer:
        "Money chase, tenant portal, messages, maintenance, access, expenses, and applications are live. Bank feeds and partner identity checks come later, see the Estate OS map.",
    },
    ...(inviteOnly
      ? [
          {
            question: "How do I get in?",
            answer:
              "Signup is invite-only. Request access or a WhatsApp callback below. Already invited? Use the link from your SMS.",
          },
        ]
      : []),
  ];

  return (
    <main className="marketing-main" id="main">
      <section
        className="marketing-hero marketing-hero-tc"
        aria-labelledby="hero-heading"
      >
        <div className="marketing-hero-glow" aria-hidden />
        <div className="marketing-container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <p className="marketing-hero-brand marketing-hero-animate">
              <span className="marketing-hero-brand-name">{BRAND_NAME}</span>
              <span className="marketing-hero-brand-stamp">{BRAND_STAMP}</span>
            </p>
            <h1
              id="hero-heading"
              className="marketing-title marketing-hero-animate marketing-hero-animate-delay"
            >
              {BRAND_TAGLINE}
            </h1>
            <p className="marketing-lede marketing-hero-animate marketing-hero-animate-delay-2">
              The landlord’s daily rent-and-chase list, cash, transfer,
              Paystack, and WhatsApp, built for Nigeria.
            </p>
            <div className="marketing-hero-actions marketing-hero-animate marketing-hero-animate-delay-3">
              {inviteOnly ? (
                <>
                  <a href="#get-started" className="btn-primary">
                    Get started
                  </a>
                  <a href="#features" className="btn-secondary">
                    See how it works
                  </a>
                </>
              ) : (
                <>
                  <Link href="/signup" className="btn-primary">
                    Get started
                  </Link>
                  <a href="#features" className="btn-secondary">
                    See how it works
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="marketing-hero-media marketing-hero-animate marketing-hero-animate-delay-3">
            <MarketingHeroFrame />
          </div>
        </div>
      </section>

      <section
        className="marketing-section marketing-trust-band"
        aria-label="Why landlords choose Nexora"
      >
        <div className="marketing-container">
          <MarketingTrustStrip />
        </div>
      </section>

      <MarketingSection
        id="features"
        headingId="features-heading"
        title="Built around the money list"
        lede="Rent first. Docs, books, and messages grow from the same unit."
      >
        <MarketingFeatureBlocks />
      </MarketingSection>

      <MarketingSection
        id="stories"
        headingId="stories-heading"
        title="Hear from early landlords"
        lede="What Friday feels like when the list is clear."
      >
        <MarketingTestimonials />
      </MarketingSection>

      <MarketingSection
        id="audiences"
        headingId="audiences-heading"
        title="The right door for each role"
        lede="Landlords run the list. Everyone else enters by invite."
        alt
      >
        <MarketingAudiences />
      </MarketingSection>

      <MarketingSection
        id="pricing"
        headingId="pricing-heading"
        title="Plans & pricing"
        lede="Start free. Upgrade when the portfolio asks for more."
      >
        <MarketingPricingTeaser />
        <p className="marketing-pricing-footnote">
          <Link href="/pricing" className="table-link">
            Compare plans →
          </Link>
        </p>
      </MarketingSection>

      <section
        id="faq"
        className="marketing-section section-spacing section-bg-alt"
        aria-labelledby="faq-heading"
      >
        <div className="marketing-container marketing-faq-split">
          <div className="marketing-faq-intro">
            <h2 id="faq-heading" className="marketing-h2">
              FAQs
            </h2>
            <p className="marketing-section-lede">
              Short answers before you start.
            </p>
          </div>
          <MarketingFaq items={faqs} />
        </div>
      </section>

      <section
        id="estate-os"
        className="marketing-section section-spacing marketing-map-demote"
        aria-labelledby="vision-heading"
      >
        <div className="marketing-container">
          <details className="marketing-map-details">
            <summary id="vision-heading" className="marketing-map-summary">
              <span className="marketing-h2 marketing-map-summary-title">
                Estate OS map
              </span>
              <span className="marketing-map-summary-hint">
                LIVE modules vs roadmap. Expand for the capability grid.
              </span>
            </summary>
            <div className="marketing-map-body">
              <MarketingVisionSection />
            </div>
          </details>
        </div>
      </section>

      <MarketingSection
        id="get-started"
        headingId="cta-heading"
        title={inviteOnly ? "Request access" : "Start your free account"}
        lede={
          inviteOnly
            ? "Closed beta. Tell us how to reach you on WhatsApp, or ask for a callback."
            : "Create your landlord account in minutes, or ask us to reach you on WhatsApp."
        }
        className="marketing-cta"
      >
        <MarketingCtaSection inviteOnly={inviteOnly} />
      </MarketingSection>
    </main>
  );
}
