import Link from "next/link";

import { StatusBadge } from "../_components/ui";
import { formatNaira, mockCharges } from "../mock/data";

export default function Phase2HubPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer">Hub</Link> · Phase 2 · PRD §9 / F20
      </p>
      <h1 className="page-title">Rent and other bills</h1>
      <p className="page-subtitle">
        Rent, service charge, and one-off charges on the same list.
      </p>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-2/charges" className="btn-primary">
          View charges
        </Link>
        <Link href="/os-explorer/phase-2/renewals" className="btn-secondary">
          Renewals
        </Link>
      </div>
      <div className="osx-stack">
        {mockCharges.map((c) => (
          <div key={c.id} className="osx-row">
            <div>
              <div>{c.type}</div>
              <div className="osx-muted mono-data">Due {c.due}</div>
            </div>
            <div className="osx-row-actions">
              <span className="mono-data">{formatNaira(c.amount)}</span>
              <StatusBadge status={c.status} />
              <Link href="/os-explorer/phase-2/charges">Record payment</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
