import Link from "next/link";

import { mockOwners } from "../../mock/data";

export default function Phase4OwnersPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-4">Phase 4</Link> · Owners · PRD F41
      </p>
      <p className="osx-persona">Manager view · Funke</p>
      <h1 className="page-title">Owners</h1>
      <p className="page-subtitle">Switch which owner&apos;s units you are chasing.</p>
      <div className="osx-stack">
        {mockOwners.map((o, i) => (
          <div key={o.id} className="osx-row">
            <div>
              <div>{o.name}</div>
              <div className="osx-muted">
                <span className="mono-data">{o.units}</span> units
              </div>
            </div>
            <button
              type="button"
              className={i === 0 ? "btn-primary" : "btn-secondary"}
            >
              {i === 0 ? "Current" : "Switch owner"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
