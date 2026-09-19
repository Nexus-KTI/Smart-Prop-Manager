"use client";

import { MarketingReveal } from "@/components/MarketingReveal";

const QUOTES = [
  {
    quote:
      "I finally see who paid without scrolling three WhatsApp groups. Repairs and renewals sit on the same unit.",
    name: "Ada O.",
    role: "Landlord · Lagos",
  },
  {
    quote:
      "Reminders that show when they fail beat silent “sent.” Gate passes mean I’m not running a second app for ops.",
    name: "Funke A.",
    role: "Portfolio landlord",
  },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Two voices - enough proof without a testimonial wall. */
export function MarketingTestimonials() {
  return (
    <div className="marketing-testimonials marketing-testimonials-lean">
      {QUOTES.map((q, index) => (
        <MarketingReveal key={q.name} delayMs={index * 60}>
          <figure className="marketing-testimonial-card marketing-testimonial-card--live">
            <span className="marketing-testimonial-mark" aria-hidden>
              “
            </span>
            <blockquote className="marketing-testimonial-quote">
              {q.quote}
            </blockquote>
            <figcaption className="marketing-testimonial-meta">
              <span className="marketing-testimonial-avatar" aria-hidden>
                {initials(q.name)}
              </span>
              <span className="marketing-testimonial-who">
                <span className="marketing-testimonial-name">{q.name}</span>
                <span className="marketing-testimonial-role">{q.role}</span>
              </span>
            </figcaption>
          </figure>
        </MarketingReveal>
      ))}
    </div>
  );
}
