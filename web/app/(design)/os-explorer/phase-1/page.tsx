import Link from "next/link";

import { StatusBadge } from "../_components/ui";
import { formatNaira, mockPortfolio } from "../mock/data";

export default function Phase1HubPage() {
  const overdue = mockPortfolio.properties.flatMap((p) =>
    p.units.filter((u) => u.status === "OVERDUE").map((u) => ({ ...u, property: p.name })),
  );

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer">Hub</Link> · Phase 1 · PRD §9 / J4
      </p>
      <h1 className="page-title">Today</h1>
      <p className="page-subtitle">
        Scan who paid and who owes, then record or chase.
      </p>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-1/payments" className="btn-primary">
          Record payment
        </Link>
        <Link href="/os-explorer/phase-1/portfolio" className="btn-secondary">
          Portfolio
        </Link>
        <Link href="/os-explorer/phase-1/reminders" className="btn-secondary">
          Reminders
        </Link>
        <Link href="/os-explorer/phase-1/settings" className="btn-secondary">
          Settings
        </Link>
      </div>
      <div className="osx-stack">
        {overdue.length === 0 ? (
          <div className="dashboard-empty">
            <p>No overdue units.</p>
            <Link href="/os-explorer/phase-1/portfolio" className="btn-primary">
              Open portfolio
            </Link>
          </div>
        ) : (
          overdue.map((u) => (
            <div key={u.id} className="osx-row">
              <div>
                <div>
                  {u.label} · {u.property}
                </div>
                <div className="osx-muted">
                  {u.tenant} ·{" "}
                  <span className="mono-data">{formatNaira(u.rent)}</span>
                </div>
              </div>
              <div className="osx-row-actions">
                <StatusBadge status={u.status} />
                <Link href="/os-explorer/phase-1/unit">Open unit</Link>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
