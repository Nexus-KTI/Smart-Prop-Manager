type RoadmapStatus = "LIVE" | "NEXT" | "LATER";

type Capability = {
  title: string;
  items: { label: string; status: RoadmapStatus }[];
};

type Phase = {
  phase: string;
  title: string;
  blurb: string;
  status: RoadmapStatus;
};

const CAPABILITIES: Capability[] = [
  {
    title: "Portfolio",
    items: [
      { label: "Properties & units", status: "LIVE" },
      { label: "Staff roles & portfolio switch", status: "LIVE" },
      { label: "Deep multi-owner agent orgs", status: "LATER" },
    ],
  },
  {
    title: "Unit Truth",
    items: [
      { label: "Paid / overdue status", status: "LIVE" },
      { label: "Tenant contact on unit", status: "LIVE" },
      { label: "Occupancy term end", status: "LIVE" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Rent", status: "LIVE" },
      { label: "Service charge & other bills", status: "LIVE" },
      { label: "Manual + card", status: "LIVE" },
      { label: "Expenses + rent roll", status: "LIVE" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Landlord account", status: "LIVE" },
      { label: "Caretaker / PM roles", status: "LIVE" },
      { label: "Tenant login & portal", status: "LIVE" },
      { label: "Artisans", status: "LIVE" },
    ],
  },
  {
    title: "Compliance",
    items: [
      { label: "Renewals on the unit", status: "LIVE" },
      { label: "Docs & acknowledge", status: "LATER" },
      { label: "Applications", status: "LIVE" },
      { label: "Background check (partner)", status: "LATER" },
    ],
  },
  {
    title: "Access",
    items: [
      { label: "Gate codes & passes", status: "LIVE" },
      { label: "Estate invites", status: "LIVE" },
    ],
  },
  {
    title: "Ops",
    items: [
      { label: "Work orders", status: "LIVE" },
      { label: "Artisan jobs", status: "LIVE" },
      { label: "Tasks & calendar", status: "LIVE" },
    ],
  },
  {
    title: "Comms",
    items: [
      { label: "Send reminder (single / bulk / retry)", status: "LIVE" },
      { label: "Messages hub (chat / bulletin / MR)", status: "LIVE" },
      { label: "One preferred channel", status: "LIVE" },
    ],
  },
  {
    title: "Trust",
    items: [
      { label: "PDF receipts", status: "LIVE" },
      { label: "Audit log & permissions", status: "LIVE" },
    ],
  },
];

const PHASES: Phase[] = [
  {
    phase: "1",
    title: "Unit money truth",
    blurb: "Who paid, who owes, what was chased, per unit.",
    status: "LIVE",
  },
  {
    phase: "2",
    title: "Bills & renewals",
    blurb: "Service charge and term-end on the same list.",
    status: "LIVE",
  },
  {
    phase: "3",
    title: "Tenant portal & checklist",
    blurb: "Checklist, tenant pay, messages. Docs & acknowledge stay Later until the privacy gate opens.",
    status: "LIVE",
  },
  {
    phase: "4",
    title: "Staff & portfolios",
    blurb: "Managers chase across owners; caretakers stay limited.",
    status: "LIVE",
  },
  {
    phase: "5",
    title: "Access & artisans",
    blurb: "Gate codes, guest invites, repair jobs.",
    status: "LIVE",
  },
];

function StatusPill({ status }: { status: RoadmapStatus }) {
  return (
    <span className="marketing-status-pill" data-status={status}>
      {status}
    </span>
  );
}

/** Public Estate OS vision, LIVE / NEXT / LATER honesty required. */
export function MarketingVisionSection() {
  return (
    <div className="marketing-vision">
      <div className="marketing-vision-block">
        <h3 className="marketing-vision-subhead">Roadmap</h3>
        <p className="marketing-vision-purpose">
          The plan over time: five phases from money truth to access and
          artisans.
        </p>
        <ol className="marketing-phase-list">
          {PHASES.map((p, i) => (
            <li
              key={p.phase}
              className="marketing-phase-card"
              data-status={p.status}
              style={{ ["--phase-delay" as string]: `${i * 60}ms` }}
            >
              <div className="marketing-phase-card-top">
                <span className="marketing-phase-label mono-data">
                  Phase {p.phase}
                </span>
                <StatusPill status={p.status} />
              </div>
              <p className="marketing-phase-title">{p.title}</p>
              <p className="marketing-phase-blurb">{p.blurb}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="marketing-vision-block">
        <h3 className="marketing-vision-subhead">Capability map</h3>
        <p className="marketing-vision-purpose">
          Everything at a glance: what’s LIVE in product today vs LATER on the
          destination.
        </p>
        <div className="marketing-capability-grid">
          {CAPABILITIES.map((group) => (
            <div key={group.title} className="marketing-capability-card">
              <p className="marketing-capability-title mono-data">
                {group.title}
              </p>
              <ul className="marketing-capability-list">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <span>{item.label}</span>
                    <StatusPill status={item.status} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
