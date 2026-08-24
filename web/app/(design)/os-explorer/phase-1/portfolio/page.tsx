import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { formatNaira, mockPortfolio } from "../../mock/data";

export default function Phase1PortfolioPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Portfolio · PRD F7 /
        Skip recovery
      </p>
      <h1 className="page-title">Portfolio</h1>
      <p className="page-subtitle">
        Properties stay listed even with zero units.
      </p>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-1/unit" className="btn-primary">
          Add unit
        </Link>
      </div>
      <div className="osx-stack">
        {mockPortfolio.properties.map((p) => (
          <div key={p.id} className="form-card">
            <h2 className="page-title" style={{ fontSize: "1.05rem" }}>
              {p.name}
            </h2>
            {p.units.length === 0 ? (
              <div className="dashboard-empty" style={{ padding: "24px 0" }}>
                <p>No units yet</p>
                <Link href="/os-explorer/phase-1/unit" className="btn-primary">
                  Add unit
                </Link>
              </div>
            ) : (
              <div className="data-table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Tenant</th>
                      <th>Rent</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {p.units.map((u) => (
                      <tr key={u.id}>
                        <td>{u.label}</td>
                        <td>{u.tenant}</td>
                        <td className="mono-data">{formatNaira(u.rent)}</td>
                        <td>
                          <StatusBadge status={u.status} />
                        </td>
                        <td>
                          <Link href="/os-explorer/phase-1/unit">Open</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
