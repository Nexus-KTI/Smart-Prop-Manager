import Link from "next/link";

import { StatusBadge, WireframeNote } from "../../_components/ui";
import { formatNaira, mockExpenses, mockUnitRows } from "../../mock/data";

export default function Phase1ReportsPage() {
  const rows = mockUnitRows().filter((r) => !r.needsUnit);
  const occupied = rows.filter((r) => !r.vacant).length;
  const vacant = rows.filter((r) => r.vacant).length;
  const monthExpenses = mockExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Reports · rent roll
      </p>
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Rent roll</h1>
          <p className="page-subtitle">
            Occupancy snapshot plus this month’s expense total.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/os-explorer/phase-1/expenses" className="btn-secondary">
            Expenses
          </Link>
          <Link href="/os-explorer/phase-1/payments" className="btn-secondary">
            Payments
          </Link>
          <Link href="/os-explorer/phase-1/portfolio" className="btn-primary">
            Properties
          </Link>
        </div>
      </header>

      <p className="page-subtitle" role="status">
        Occupied {occupied} · Vacant {vacant} · Month expenses{" "}
        <Link href="/os-explorer/phase-1/expenses" className="table-link mono-data">
          {formatNaira(monthExpenses)}
        </Link>
      </p>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Unit</th>
              <th>Rent</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.property}</td>
                <td>
                  <Link href="/os-explorer/phase-1/unit" className="table-link">
                    {r.label}
                  </Link>
                </td>
                <td className="mono-data">
                  {r.rent > 0 ? formatNaira(r.rent) : "-"}
                </td>
                <td>{r.tenant}</td>
                <td>
                  {r.vacant ? (
                    <span className="status-badge pending">VACANT</span>
                  ) : (
                    <StatusBadge status={r.status} />
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    <Link
                      href="/os-explorer/phase-1/unit"
                      className="table-link"
                    >
                      Payments
                    </Link>
                    {r.vacant ? (
                      <Link
                        href="/os-explorer/phase-1/tenancies"
                        className="table-link"
                      >
                        Start tenancy
                      </Link>
                    ) : (
                      <Link
                        href="/os-explorer/phase-3"
                        className="table-link"
                      >
                        Tenancy
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WireframeNote>
        Prod: expenses total links to Expenses; row Payments + Tenancy / Start
        tenancy via property_id.
      </WireframeNote>
    </>
  );
}
