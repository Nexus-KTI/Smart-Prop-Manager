import {
  Banknote,
  ClipboardList,
  MessageSquare,
  PieChart,
} from "lucide-react";
import Link from "next/link";

import { formatNaira } from "@/lib/dashboard";

type Block = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  bullets: string[];
  href: string;
  Icon: typeof Banknote;
  visual: "rent" | "leasing" | "accounting" | "messages";
};

const BLOCKS: Block[] = [
  {
    id: "rent",
    kicker: "Rent collection",
    title: "Collect payments, effortlessly",
    body: "Tenants pay online when you want, or you record cash and transfer on the same list.",
    bullets: [
      "Accept cash, transfer, or Paystack on one ledger",
      "See paid, due soon, and overdue at a glance",
      "Send reminders with real failure detail",
    ],
    href: "#get-started",
    Icon: Banknote,
    visual: "rent",
  },
  {
    id: "leasing",
    kicker: "Applications & docs",
    title: "Find the right renters, faster",
    body: "Share an apply link from the unit, review submissions, and hand tenants the docs they need to acknowledge before move-in.",
    bullets: [
      "Invite to apply, approve or reject in one place",
      "Tenancy checklist and dossier on the unit",
      "Document share with I acknowledge",
    ],
    href: "#get-started",
    Icon: ClipboardList,
    visual: "leasing",
  },
  {
    id: "accounting",
    kicker: "Accounting",
    title: "Take control of the books",
    body: "Track estate spend beside the unit ledger. Pull a rent roll when you need the portfolio view, without another spreadsheet night.",
    bullets: [
      "Expenses logged against the estate",
      "Rent roll by unit and cycle",
      "Scheduled fees tenants can settle",
    ],
    href: "/pricing",
    Icon: PieChart,
    visual: "accounting",
  },
  {
    id: "messages",
    kicker: "Messages & portal",
    title: "Chat and repairs on the unit",
    body: "Estate bulletins and maintenance threads live beside the money list, so nothing vanishes into private chats.",
    bullets: [
      "Messages hub: chat, publications, maintenance",
      "Tenant portal for pay, docs, and requests",
      "Artisan jobs from work orders",
    ],
    href: "#audiences",
    Icon: MessageSquare,
    visual: "messages",
  },
];

function FeatureVisual({ kind }: { kind: Block["visual"] }) {
  if (kind === "rent") {
    return (
      <div className="marketing-vignette" data-kind="rent">
        <p className="marketing-vignette-label">Unit list</p>
        <div className="marketing-vignette-row">
          <span>Cedar · Flat 7</span>
          <span className="status-badge overdue">OVERDUE</span>
        </div>
        <div className="marketing-vignette-row">
          <span>Palm Court · 2</span>
          <span className="status-badge paid">PAID</span>
        </div>
        <div className="marketing-vignette-row">
          <span>Marina · 1A</span>
          <span className="status-badge due-soon">DUE SOON</span>
        </div>
        <p className="marketing-vignette-foot mono-data">
          Chase · {formatNaira(1_500_000)}
        </p>
      </div>
    );
  }

  if (kind === "leasing") {
    return (
      <div className="marketing-vignette" data-kind="leasing">
        <p className="marketing-vignette-label">Applications</p>
        <div className="marketing-vignette-card">
          <strong>Funke Adebayo</strong>
          <span>Palm Court · Flat 2</span>
          <span className="marketing-vignette-pill">New</span>
        </div>
        <div className="marketing-vignette-card">
          <strong>Tunde Okoro</strong>
          <span>Marina · Unit 1A</span>
          <span className="marketing-vignette-pill" data-tone="muted">
            In review
          </span>
        </div>
      </div>
    );
  }

  if (kind === "accounting") {
    return (
      <div className="marketing-vignette" data-kind="accounting">
        <p className="marketing-vignette-label">Rent roll</p>
        <div className="marketing-vignette-stat">
          <span>Collected</span>
          <strong className="mono-data">{formatNaira(4_200_000)}</strong>
        </div>
        <div className="marketing-vignette-stat">
          <span>Outstanding</span>
          <strong className="mono-data">{formatNaira(2_700_000)}</strong>
        </div>
        <div className="marketing-vignette-bar" aria-hidden>
          <span style={{ width: "61%" }} />
        </div>
        <p className="marketing-vignette-foot">61% of portfolio paid this cycle</p>
      </div>
    );
  }

  return (
    <div className="marketing-vignette" data-kind="messages">
      <p className="marketing-vignette-label">Messages</p>
      <div className="marketing-vignette-msg" data-from="tenant">
        Water pressure dropped again in Flat 7.
      </div>
      <div className="marketing-vignette-msg" data-from="you">
        Logged. Assigning plumber today.
      </div>
      <p className="marketing-vignette-foot">Chat · Bulletin · Maintenance</p>
    </div>
  );
}

/** TenantCloud alternating features, NG copy + product vignettes. */
export function MarketingFeatureBlocks() {
  return (
    <div className="marketing-feature-blocks">
      {BLOCKS.map((block, index) => (
        <article
          key={block.id}
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
                Learn more →
              </a>
            )}
          </div>
          <div className="marketing-feature-block-visual">
            <FeatureVisual kind={block.visual} />
          </div>
        </article>
      ))}
    </div>
  );
}
