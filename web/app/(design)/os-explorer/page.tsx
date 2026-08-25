import Link from "next/link";

const PHASES = [
  {
    href: "/os-explorer/phase-1",
    title: "Phase 1 · Unit money truth",
    blurb: "Who paid, who owes, what was chased, per unit.",
  },
  {
    href: "/os-explorer/phase-2",
    title: "Phase 2 · Bills & renewals",
    blurb: "Service charge and term-end on the same list.",
  },
  {
    href: "/os-explorer/phase-3",
    title: "Phase 3 · Docs & tenant pay",
    blurb: "Agreements, checklist, then tenant can pay.",
  },
  {
    href: "/os-explorer/phase-4",
    title: "Phase 4 · Staff & portfolios",
    blurb: "Managers chase across owners; caretakers stay limited.",
  },
  {
    href: "/os-explorer/phase-5",
    title: "Phase 5 · Access & artisans",
    blurb: "Gate codes, guest invites, repair jobs.",
  },
];

export default function OsExplorerHubPage() {
  return (
    <>
      <p className="osx-meta">Wireframe · mock data · not production</p>
      <h1 className="page-title">Nexora</h1>
      <p className="page-subtitle">
        Who paid. Who owes. What&apos;s next., click through Phases 1–5 with
        mock data only.
      </p>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-1" className="btn-primary">
          Enter Phase 1
        </Link>
      </div>
      <div className="osx-grid">
        {PHASES.map((p) => (
          <Link key={p.href} href={p.href} className="osx-card">
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
