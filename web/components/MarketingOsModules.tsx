"use client";

import {
  Banknote,
  ClipboardList,
  DoorOpen,
  MessageSquare,
  Shield,
  Wrench,
} from "lucide-react";

import { MarketingReveal } from "@/components/MarketingReveal";

type Pillar = {
  id: string;
  title: string;
  body: string;
  Icon: typeof Banknote;
};

/** Six OS pillars - coverage without an essay per module. */
const PILLARS: Pillar[] = [
  {
    id: "money",
    title: "Money & books",
    body: "Rent, fees, cash/transfer/card, reminders, receipts, expenses, rent roll.",
    Icon: Banknote,
  },
  {
    id: "occupancy",
    title: "Occupancy",
    body: "Applications, tenancy checklist, renewals on the unit. Docs & acknowledge Later.",
    Icon: ClipboardList,
  },
  {
    id: "comms",
    title: "Portal & messages",
    body: "Tenant pay and requests. Chat, bulletins, and preferred SMS/WhatsApp/email.",
    Icon: MessageSquare,
  },
  {
    id: "ops",
    title: "Repairs & artisans",
    body: "Work orders from the unit to a claimable artisan job - trail stays put.",
    Icon: Wrench,
  },
  {
    id: "access",
    title: "Access",
    body: "Gate codes and guest passes you can issue and revoke.",
    Icon: DoorOpen,
  },
  {
    id: "staff",
    title: "Staff & audit",
    body: "Managers and caretakers with scopes. Tasks, calendar, chase audit.",
    Icon: Shield,
  },
];

export function MarketingOsModules() {
  return (
    <div className="marketing-os-modules">
      <ul className="marketing-os-pillar-grid">
        {PILLARS.map((pillar, index) => (
          <MarketingReveal key={pillar.id} as="li" delayMs={index * 50}>
            <div id={pillar.id} className="marketing-os-pillar">
              <pillar.Icon
                size={18}
                aria-hidden
                className="marketing-os-pillar-icon"
              />
              <div className="marketing-os-pillar-copy">
                <h3 className="marketing-os-pillar-title">{pillar.title}</h3>
                <p className="marketing-os-pillar-body">{pillar.body}</p>
              </div>
            </div>
          </MarketingReveal>
        ))}
      </ul>

      <MarketingReveal delayMs={80}>
        <aside className="marketing-os-later" aria-label="Coming later">
          <p className="marketing-os-later-kicker">Honest about later</p>
          <p className="marketing-os-later-body">
            Not live yet: bank feeds, partner NIN/BVN checks, and deep multi-owner
            agent orgs. We label LATER - we don’t sell it as shipped.
          </p>
        </aside>
      </MarketingReveal>
    </div>
  );
}
