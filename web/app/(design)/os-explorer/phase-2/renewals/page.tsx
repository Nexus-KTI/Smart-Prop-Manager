import Link from "next/link";

import { mockRenewals } from "../../mock/data";

export default function Phase2RenewalsPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-2">Phase 2</Link> · Renewals · PRD F21 /
        J9
      </p>
      <h1 className="page-title">Renewals</h1>
      <p className="page-subtitle">
        Term end coming due — without tracking it in Excel.
      </p>
      <div className="osx-stack">
        {mockRenewals.map((r) => (
          <div key={r.id} className="osx-row">
            <div>
              <div>{r.unit}</div>
              <div className="osx-muted">
                Ends <span className="mono-data">{r.termEnd}</span> ·{" "}
                <span className="mono-data">{r.daysLeft}</span> days
              </div>
            </div>
            <button type="button" className="btn-primary">
              Send renewal reminder
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
