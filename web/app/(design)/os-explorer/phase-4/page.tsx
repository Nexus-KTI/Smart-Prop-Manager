import Link from "next/link";

import { formatNaira, mockOverdueOps } from "../mock/data";

export default function Phase4HubPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer">Hub</Link> · Phase 4 · PRD F42 / Funke
      </p>
      <p className="osx-persona">Manager view · Funke</p>
      <h1 className="page-title">Who owes across owners</h1>
      <p className="page-subtitle">
        Overdue units — send a reminder or open the unit.
      </p>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-4/owners" className="btn-secondary">
          Switch owner
        </Link>
        <Link href="/os-explorer/phase-4/team" className="btn-secondary">
          Team (managers)
        </Link>
      </div>
      <div className="osx-stack">
        {mockOverdueOps.map((o) => (
          <div key={o.id} className="osx-row">
            <div>
              <div>
                {o.unit} · {o.owner}
              </div>
              <div className="osx-muted">
                <span className="mono-data">{formatNaira(o.amount)}</span> ·{" "}
                <span className="mono-data">{o.daysOverdue}</span> days overdue
              </div>
            </div>
            <div className="osx-row-actions">
              <Link href="/os-explorer/phase-1/unit">Open unit</Link>
              <button type="button" className="btn-primary">
                Send reminder
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
