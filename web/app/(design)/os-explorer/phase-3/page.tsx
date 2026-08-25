import Link from "next/link";

export default function Phase3HubPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer">Hub</Link> · Phase 3 · PRD J6 / F30
      </p>
      <p className="osx-persona">Landlord view · Ada</p>
      <h1 className="page-title">Tenant paperwork</h1>
      <p className="page-subtitle">
        Flat 1A, collect docs and finish the checklist before move-in.
      </p>
      <div className="form-card" style={{ marginTop: 16 }}>
        <p className="form-kicker">Chioma Okeke · Flat 1A</p>
        <p>
          Term <span className="mono-data">2025-10-01 → 2026-10-01</span>
        </p>
        <p className="osx-muted">Checklist incomplete, finish the steps.</p>
      </div>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-3/verification" className="btn-primary">
          Continue checklist
        </Link>
        <Link href="/os-explorer/phase-3/documents" className="btn-secondary">
          Documents
        </Link>
        <Link href="/os-explorer/phase-3/tenant" className="btn-secondary">
          See tenant pay screen
        </Link>
      </div>
    </>
  );
}
