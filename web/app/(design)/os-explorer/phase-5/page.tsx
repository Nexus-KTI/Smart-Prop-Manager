import Link from "next/link";

import { mockAccessCodes } from "../mock/data";

export default function Phase5HubPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer">Hub</Link> · Phase 5 · PRD F50 / J8
      </p>
      <p className="osx-persona">Landlord / caretaker · gate</p>
      <h1 className="page-title">Gate codes</h1>
      <p className="page-subtitle">Who may enter, issue a code or invite a guest.</p>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          Issue gate code
        </button>
        <Link href="/os-explorer/phase-5/invites" className="btn-secondary">
          Guest invites
        </Link>
        <Link href="/os-explorer/phase-5/work-orders" className="btn-secondary">
          Repair jobs
        </Link>
        <Link href="/os-explorer/phase-5/artisan" className="btn-secondary">
          Artisan job list
        </Link>
      </div>
      <div className="osx-stack">
        {mockAccessCodes.length === 0 ? (
          <div className="dashboard-empty">
            <p>No codes issued</p>
            <button type="button" className="btn-primary">
              Issue gate code
            </button>
          </div>
        ) : (
          mockAccessCodes.map((c) => (
            <div key={c.id} className="osx-row">
              <div>
                <div>{c.who}</div>
                <div className="osx-muted">{c.window}</div>
              </div>
              <span className="mono-data">{c.code}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
