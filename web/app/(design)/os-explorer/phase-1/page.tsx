import Link from "next/link";

import { StatusBadge } from "../_components/ui";
import { formatNaira, mockUnitRows } from "../mock/data";

const LOOP_LINKS = [
  { href: "/os-explorer/phase-1/portfolio", label: "Properties" },
  { href: "/os-explorer/phase-1/payments", label: "Payments" },
  { href: "/os-explorer/phase-1/reminders", label: "Reminders" },
  { href: "/os-explorer/phase-1/tenancies", label: "Tenancies" },
  { href: "/os-explorer/phase-1/expenses", label: "Expenses" },
  { href: "/os-explorer/phase-1/reports", label: "Reports" },
  { href: "/os-explorer/phase-1/help", label: "Help" },
  { href: "/os-explorer/phase-1/settings", label: "Settings" },
];

export default function Phase1HubPage() {
  const overdue = mockUnitRows().filter(
    (u) => u.status === "OVERDUE" && !u.needsUnit,
  );

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer">Hub</Link> · Phase 1 · Ada Friday loop
      </p>
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-subtitle">
            Scan who paid and who owes, then record or chase.
          </p>
        </div>
        <div className="dashboard-header-actions">
          {overdue.length > 0 ? (
            <Link href="/os-explorer/phase-1/reminders" className="btn-primary">
              {overdue.length} overdue → Chase
            </Link>
          ) : null}
          <Link href="/os-explorer/phase-1/payments" className="btn-secondary">
            Payments
          </Link>
          <Link href="/os-explorer/phase-1/portfolio" className="btn-secondary">
            Properties
          </Link>
        </div>
      </header>

      <div className="osx-actions" style={{ marginBottom: 16 }}>
        {LOOP_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="btn-secondary">
            {l.label}
          </Link>
        ))}
      </div>

      <div className="osx-stack">
        {overdue.length === 0 ? (
          <div className="dashboard-empty">
            <p className="dashboard-empty-title mono-data">No overdue units.</p>
            <Link href="/os-explorer/phase-1/portfolio" className="btn-primary">
              Open properties
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
                <Link href="/os-explorer/phase-1/unit" className="table-link">
                  Open unit
                </Link>
                <Link
                  href="/os-explorer/phase-1/reminders"
                  className="table-link"
                >
                  Remind
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
