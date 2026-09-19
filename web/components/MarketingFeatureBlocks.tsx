"use client";

import { Banknote, Wrench } from "lucide-react";
import Link from "next/link";

import { MarketingReveal } from "@/components/MarketingReveal";
import { formatNaira } from "@/lib/dashboard";

type Block = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  href: string;
  Icon: typeof Banknote;
  visual: "rent" | "ops";
};

const BLOCKS: Block[] = [
  {
    id: "money-deep",
    kicker: "Friday",
    title: "Who paid. Who owes. Chase without a silent send.",
    body: "The unit list is the wedge: cash, transfer, and card on one ledger - reminders that show when they fail.",
    bullets: [
      "Paid, due soon, overdue at a glance",
      "Service charge on the same trail",
      "PDF receipts when you need paper",
    ],
    href: "#get-started",
    Icon: Banknote,
    visual: "rent",
  },
  {
    id: "ops-deep",
    kicker: "The rest of the week",
    title: "Apply, repair, and open the gate - on the unit.",
    body: "Occupancy paperwork and weekday ops share the same truth as rent. No third app for the caretaker.",
    bullets: [
      "Applications, docs, renewals on the dossier",
      "Messages and work orders beside the money list",
      "Gate passes you can revoke",
    ],
    href: "#audiences",
    Icon: Wrench,
    visual: "ops",
  },
];

const RENT_ROWS = [
  { unit: "Cedar · Flat 7", status: "overdue" as const, label: "OVERDUE" },
  { unit: "Palm Court · 2", status: "paid" as const, label: "PAID" },
  { unit: "Marina · 1A", status: "due-soon" as const, label: "DUE SOON" },
  { unit: "Ikeja · B3", status: "overdue" as const, label: "OVERDUE" },
];

function FeatureVisual({ kind }: { kind: Block["visual"] }) {
  if (kind === "rent") {
    return (
      <div className="marketing-vignette marketing-vignette--live" data-kind="rent">
        <div className="marketing-vignette-head">
          <p className="marketing-vignette-label">Unit list</p>
        </div>
        <div className="marketing-vignette-stroll">
          <div className="marketing-vignette-stroll-rail">
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className="marketing-vignette-stroll-set"
                aria-hidden={copy === 1 ? true : undefined}
              >
                {RENT_ROWS.map((row) => (
                  <div
                    key={`${copy}-${row.unit}`}
                    className="marketing-vignette-row"
                    data-status={row.status}
                  >
                    <span className="marketing-vignette-row-signal" aria-hidden />
                    <span className="marketing-vignette-row-unit">{row.unit}</span>
                    <span className={`status-badge ${row.status}`}>
                      {row.label}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="marketing-vignette-foot mono-data">
          Next chase · Cedar · {formatNaira(1_500_000)}
        </p>
      </div>
    );
  }

  return (
    <div className="marketing-vignette marketing-vignette--live" data-kind="ops">
      <p className="marketing-vignette-label">Ops board</p>
      <div className="marketing-vignette-card">
        <strong>Funke Adebayo</strong>
        <span>Palm Court · Flat 2</span>
        <span className="marketing-vignette-pill">New apply</span>
      </div>
      <div className="marketing-vignette-msg" data-from="tenant">
        Water pressure dropped again in Flat 7.
      </div>
      <div className="marketing-vignette-card">
        <strong>WO-184 · Plumber</strong>
        <span>Assigned · gate pass issued</span>
        <span className="marketing-vignette-pill">Open</span>
      </div>
    </div>
  );
}

/** Two deep dives - money wedge and weekday OS. */
export function MarketingFeatureBlocks() {
  return (
    <div className="marketing-feature-blocks">
      {BLOCKS.map((block, index) => (
        <MarketingReveal key={block.id} delayMs={index * 40}>
          <article
            id={block.id}
            className="marketing-feature-block"
            data-flip={index % 2 === 1 ? "true" : undefined}
          >
            <div className="marketing-feature-block-copy">
              <p className="marketing-feature-kicker">
                <block.Icon size={16} aria-hidden /> {block.kicker}
              </p>
              <h3 className="marketing-feature-block-title">{block.title}</h3>
              <p className="marketing-feature-block-body">{block.body}</p>
              <ul className="marketing-feature-bullets">
                {block.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              {block.href.startsWith("/") ? (
                <Link href={block.href} className="marketing-feature-more">
                  Learn more →
                </Link>
              ) : (
                <a href={block.href} className="marketing-feature-more">
                  Continue →
                </a>
              )}
            </div>
            <div className="marketing-feature-block-visual">
              <FeatureVisual kind={block.visual} />
            </div>
          </article>
        </MarketingReveal>
      ))}
    </div>
  );
}
