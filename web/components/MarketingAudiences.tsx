"use client";

import {
  Building2,
  Hammer,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";

import { MarketingReveal } from "@/components/MarketingReveal";

type Audience = {
  title: string;
  body: string;
  href: string;
  cta: string;
  Icon: typeof Building2;
};

const AUDIENCES: Audience[] = [
  {
    title: "Landlords",
    body: "Own money, occupancy, and ops from one portfolio.",
    href: "#product",
    cta: "See what’s live",
    Icon: Building2,
  },
  {
    title: "Managers",
    body: "Staff invite. Chase across owners - no shared login.",
    href: "/staff/claim",
    cta: "Claim invite",
    Icon: Users,
  },
  {
    title: "Tenants",
    body: "Pay, docs, repairs, notices - after invite claim.",
    href: "/signup?role=tenant",
    cta: "Tenant signup",
    Icon: UserRound,
  },
  {
    title: "Artisans",
    body: "Claim jobs, close them out, access when needed.",
    href: "/artisan/claim",
    cta: "Artisan claim",
    Icon: Hammer,
  },
];

export function MarketingAudiences() {
  return (
    <div className="marketing-audience-grid">
      {AUDIENCES.map((a, index) => {
        const inner = (
          <>
            <span className="marketing-audience-icon-wrap" aria-hidden>
              <a.Icon className="marketing-audience-icon" size={20} />
            </span>
            <h3 className="marketing-audience-title">{a.title}</h3>
            <p className="marketing-audience-body">{a.body}</p>
            <span className="marketing-audience-cta">
              {a.cta}
              <span className="marketing-arrow" aria-hidden>
                →
              </span>
            </span>
          </>
        );

        return (
          <MarketingReveal key={a.title} delayMs={index * 70}>
            <article className="marketing-audience-card">
              {a.href.startsWith("/") ? (
                <Link href={a.href} className="marketing-audience-link">
                  {inner}
                </Link>
              ) : (
                <a href={a.href} className="marketing-audience-link">
                  {inner}
                </a>
              )}
            </article>
          </MarketingReveal>
        );
      })}
    </div>
  );
}
