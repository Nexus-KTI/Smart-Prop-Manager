import Link from "next/link";
import {
  Banknote,
  CalendarClock,
  FileText,
  ListChecks,
  Send,
  Wallet,
} from "lucide-react";

import { MarketingCtaSection } from "@/components/MarketingCtaSection";
import { MarketingFaq } from "@/components/MarketingFaq";
import {
  MarketingFeatureList,
  type MarketingFeature,
} from "@/components/MarketingFeatureList";
import { MarketingHeroPreview } from "@/components/MarketingHeroPreview";
import { MarketingSection } from "@/components/MarketingSection";
import { MarketingTrustStrip } from "@/components/MarketingTrustStrip";
import { MarketingVisionSection } from "@/components/MarketingVisionSection";
import { ProductPreviewMedia } from "@/components/ProductPreviewMedia";
import { BRAND_NAME, BRAND_STAMP, BRAND_TAGLINE } from "@/lib/brand";
import { inviteOnlySignup } from "@/lib/invite";

const FEATURES: MarketingFeature[] = [
  {
    title: "Unit working list",
    body: "Who paid, who owes, what was chased, without opening a spreadsheet.",
    Icon: ListChecks,
  },
  {
    title: "Record payment",
    body: "Cash, transfer, or Paystack. Same history on the unit.",
    Icon: Banknote,
  },
  {
    title: "Service charge and other bills",
    body: "Recurring charges beyond rent, on the same unit list and receipts.",
    Icon: Wallet,
  },
  {
    title: "Send reminder",
    body: "Chase from the unit (single, bulk, or retry) and see what was sent.",
    Icon: Send,
  },
  {
    title: "Receipts on demand",
    body: "Download a PDF when a tenant asks. No chat archaeology.",
    Icon: FileText,
  },
  {
    title: "Renewal in view",
    body: "Set term end on the unit so renewal doesn’t live only in Excel.",
    Icon: CalendarClock,
  },
];

export default function MarketingPage() {
  const inviteOnly = inviteOnlySignup();

  const faqs = [
    {
      question: "Who is this for?",
      answer:
        "Landlords who live in WhatsApp and cash, and still track rent in a spreadsheet.",
    },
    {
      question: "Is the full Estate OS available today?",
      answer: `${BRAND_NAME} is building the full estate operating system: money through docs, staff, access, and artisans. What’s LIVE today is unit money truth: rent, service charge, renewals, reminders, and receipts. Later phases are on the map and labeled LATER, not in your account yet. Landlord-only for now.`,
    },
    {
      question: "What does it cost?",
      answer: inviteOnly
        ? "Free to first value once you’re invited. Request access below. No hard paywall on the product once you’re in."
        : "Free to start. Add your first property and units without a paywall on first run.",
    },
    {
      question: "Do I need to change how I collect rent?",
      answer:
        "No. Keep cash and transfers. Use Paystack only if you want online payments.",
    },
    {
      question: "Is there a tenant app?",
      answer: `No. ${BRAND_NAME} is landlord-only. Tenants keep paying the way they already do.`,
    },
    ...(inviteOnly
      ? [
          {
            question: "How do I get in?",
            answer:
              "Signup is invite-only right now. Request access or a WhatsApp callback on this page. We send a signup link when you’re approved. Already invited? Use the link from your SMS.",
          },
        ]
      : []),
  ];

  return (
    <main className="marketing-main" id="main">
      <section className="marketing-section marketing-hero section-spacing">
        <div className="marketing-container">
          <p className="marketing-brand marketing-hero-animate">
            <span className="marketing-brand-name">{BRAND_NAME}</span>
            <span className="marketing-brand-stamp">{BRAND_STAMP}</span>
          </p>
          <h1 className="marketing-title marketing-hero-animate marketing-hero-animate-delay">
            An estate operating system that starts with who paid.
          </h1>
          <p className="marketing-lede marketing-hero-animate marketing-hero-animate-delay-2">
            <span className="marketing-tagline">{BRAND_TAGLINE}</span>
            {" "}
            Built for Nigerian landlords. We ship in sequence; only what’s marked
            LIVE is in product today.
          </p>
          <div className="marketing-hero-actions marketing-hero-animate marketing-hero-animate-delay-3">
            {inviteOnly ? (
              <>
                <a href="#get-started" className="btn-primary">
                  Request access
                </a>
                <a href="#estate-os" className="btn-secondary">
                  See the full map
                </a>
              </>
            ) : (
              <>
                <Link href="/signup" className="btn-primary">
                  Get started free
                </Link>
                <a href="#estate-os" className="btn-secondary">
                  See the full map
                </a>
              </>
            )}
          </div>
          <div className="marketing-hero-animate marketing-hero-animate-delay-4">
            <MarketingHeroPreview />
          </div>
        </div>
      </section>

      <section
        className="marketing-section marketing-trust-band"
        aria-label="Today on Nexora"
      >
        <div className="marketing-container">
          <MarketingTrustStrip />
        </div>
      </section>

      <MarketingSection
        id="estate-os"
        headingId="vision-heading"
        title="The estate operating system"
        lede="Full destination. Every module is labeled: LIVE is available now; LATER is on the roadmap, not in your account yet."
        alt
      >
        <MarketingVisionSection />
      </MarketingSection>

      <MarketingSection
        id="preview"
        headingId="preview-heading"
        title="What’s live today"
        lede="Unit money truth on one list: rent, service charge, due day, paid or overdue. Add unit. Record payment. Send reminder."
      >
        <div className="marketing-live-chapter">
          <ProductPreviewMedia />
          <MarketingFeatureList items={FEATURES} variant="grid" />
        </div>
      </MarketingSection>

      <MarketingSection
        id="faq"
        headingId="faq-heading"
        title="FAQ"
        lede="Straight answers before you request access."
      >
        <MarketingFaq items={faqs} />
      </MarketingSection>

      <MarketingSection
        id="request-access"
        headingId="cta-heading"
        title={inviteOnly ? "Request access" : "Start with your first property"}
        lede={
          inviteOnly
            ? "Closed beta right now. Tell us how to reach you on WhatsApp, or ask for a callback if you’d rather talk it through."
            : "Free account in minutes, or ask us to reach you on WhatsApp if you’d rather talk it through."
        }
        className="marketing-cta"
      >
        <MarketingCtaSection inviteOnly={inviteOnly} />
      </MarketingSection>
    </main>
  );
}
