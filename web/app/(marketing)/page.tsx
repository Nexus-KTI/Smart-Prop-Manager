import Link from "next/link";

import { MarketingAudiences } from "@/components/MarketingAudiences";
import { MarketingCtaSection } from "@/components/MarketingCtaSection";
import { MarketingFaq } from "@/components/MarketingFaq";
import { MarketingHeroFrame } from "@/components/MarketingHeroFrame";
import { MarketingOsModules } from "@/components/MarketingOsModules";
import { MarketingReveal } from "@/components/MarketingReveal";
import { MarketingSection } from "@/components/MarketingSection";
import { MarketingTestimonials } from "@/components/MarketingTestimonials";
import { MarketingStickyCta } from "@/components/MarketingStickyCta";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

const CTA_EXPECT = [
  "Who paid and who owes, per unit",
  "Repairs, access, and messages on the same trail",
  "You leave with a clear next step either way",
] as const;

export default function MarketingPage() {
  const inviteOnly = inviteOnlySignup();
  const primaryLabel = inviteOnly ? "Request access" : "Start free";
  const primaryHref = inviteOnly ? "#get-started" : "/signup";

  const faqs = [
    {
      question: `What is ${BRAND_NAME}?`,
      answer: `An Estate OS for Nigerian landlords - money, tenancies, messages, repairs, access, staff, and books on one unit trail. ${BRAND_TAGLINE}`,
    },
    {
      question: "Is it only a rent collector?",
      answer:
        "No. Rent chase is the Friday wedge. Applications, renewals, portal, messages, work orders, gate passes, staff, expenses, and rent roll are live today. Docs & acknowledge stay Later until the privacy gate opens.",
    },
    {
      question: "How much does it cost?",
      answer: inviteOnly
        ? "Invite beta is free once approved. Paid plans come later - see Pricing."
        : "Free to start with your first property. Paid plans come later - see Pricing.",
    },
    ...(inviteOnly
      ? [
          {
            question: "How do I get in?",
            answer:
              "Signup is invite-only. Request access below, or use the SMS invite link you already have.",
          },
        ]
      : []),
  ];

  return (
    <main className="marketing-main marketing-lean" id="main">
      <section
        className="marketing-hero marketing-hero-tc"
        aria-labelledby="hero-heading"
      >
        <div className="marketing-container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <h1
              id="hero-heading"
              className="marketing-title marketing-hero-animate"
            >
              Estate OS for Nigerian landlords
            </h1>
            <p className="marketing-lede marketing-hero-animate marketing-hero-animate-delay">
              One unit truth for rent, renewals, repairs, and access.
            </p>
            <p
              className="marketing-process-line marketing-hero-animate marketing-hero-animate-delay mono-data"
              aria-label="How the estate runs"
            >
              <span>Apply</span>
              <span className="marketing-process-arrow" aria-hidden>
                →
              </span>
              <span>Chase</span>
              <span className="marketing-process-arrow" aria-hidden>
                →
              </span>
              <span>Repair</span>
              <span className="marketing-process-arrow" aria-hidden>
                →
              </span>
              <span>Renew</span>
            </p>
            <div className="marketing-hero-actions marketing-hero-animate marketing-hero-animate-delay-2">
              {primaryHref.startsWith("#") ? (
                <a href={primaryHref} className="btn-primary">
                  {primaryLabel}
                </a>
              ) : (
                <Link href={primaryHref} className="btn-primary">
                  {primaryLabel}
                </Link>
              )}
              <a href="#product" className="btn-outline marketing-hero-secondary">
                <span className="marketing-hero-secondary-label">See what’s live</span>
                <span className="marketing-arrow-box" aria-hidden>
                  <span className="marketing-arrow-box-track">
                    <span className="marketing-arrow">→</span>
                    <span className="marketing-arrow">→</span>
                  </span>
                </span>
              </a>
            </div>
          </div>
          <div className="marketing-hero-media marketing-hero-animate marketing-hero-animate-delay-2">
            <MarketingHeroFrame />
          </div>
        </div>
      </section>

      <MarketingSection
        id="product"
        headingId="product-heading"
        title="What’s live in the OS"
        lede="Six pillars on one unit trail - not a rent tool with a roadmap slide."
      >
        <MarketingOsModules />
      </MarketingSection>

      <MarketingSection
        id="audiences"
        headingId="audiences-heading"
        title="Four doors. One estate."
        lede="Landlords own the OS. Everyone else enters by invite."
        alt
      >
        <MarketingAudiences />
      </MarketingSection>

      <MarketingSection
        id="stories"
        headingId="stories-heading"
        title="From the chase"
        lede="Illustrative early voices - not star ratings."
      >
        <MarketingTestimonials />
      </MarketingSection>

      <section
        id="faq"
        className="marketing-section section-spacing"
        aria-labelledby="faq-heading"
      >
        <div className="marketing-container marketing-faq-block">
          <MarketingReveal>
            <div className="marketing-faq-intro">
              <h2 id="faq-heading" className="marketing-h2">
                Questions
              </h2>
              <p className="marketing-section-lede">
                Short answers.{" "}
                <Link href="/pricing" className="table-link marketing-text-arrow-link">
                  Pricing
                  <span className="marketing-arrow" aria-hidden>
                    →
                  </span>
                </Link>
              </p>
            </div>
          </MarketingReveal>
          <MarketingReveal delayMs={80}>
            <MarketingFaq items={faqs} />
          </MarketingReveal>
        </div>
      </section>

      <section
        id="get-started"
        className="marketing-section section-spacing section-bg-alt marketing-cta marketing-cta-band"
        aria-labelledby="cta-heading"
      >
        <div className="marketing-container marketing-cta-band-inner">
          <MarketingReveal>
            <div className="marketing-cta-band-copy">
              <h2 id="cta-heading" className="marketing-h2">
                Let’s start with a conversation
              </h2>
              <p className="marketing-section-lede">
                Tell us what’s slow on the estate - chase, repairs, or renewals.
              </p>
              <ul className="marketing-cta-expect mono-data">
                {CTA_EXPECT.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </MarketingReveal>
          <MarketingReveal delayMs={90}>
            <div className="marketing-cta-band-actions">
              <MarketingCtaSection
                inviteOnly={inviteOnly}
                primaryLabel={primaryLabel}
              />
            </div>
          </MarketingReveal>
        </div>
      </section>

      <MarketingStickyCta label={primaryLabel} href={primaryHref} />
    </main>
  );
}
