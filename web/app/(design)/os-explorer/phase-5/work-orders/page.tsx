import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { mockWorkOrders } from "../../mock/data";

export default function Phase5WorkOrdersPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-5">Phase 5</Link> · Repair jobs · PRD
        F51 / J10
      </p>
      <p className="osx-persona">Landlord / caretaker</p>
      <h1 className="page-title">Repair jobs</h1>
      <p className="page-subtitle">Jobs on a unit — invite an artisan when needed.</p>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          New repair job
        </button>
      </div>
      <div className="osx-stack">
        {mockWorkOrders.map((w) => (
          <div key={w.id} className="osx-row">
            <div>
              <div>
                {w.title} · {w.unit}
              </div>
              <div className="osx-muted">{w.artisan}</div>
            </div>
            <div className="osx-row-actions">
              <StatusBadge status={w.status} />
              {w.status === "open" ? (
                <button type="button" className="btn-secondary">
                  Invite artisan
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
