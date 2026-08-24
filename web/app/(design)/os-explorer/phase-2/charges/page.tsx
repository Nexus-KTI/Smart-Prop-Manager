import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { formatNaira, mockCharges } from "../../mock/data";

export default function Phase2ChargesPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-2">Phase 2</Link> · Charges · PRD F20
      </p>
      <h1 className="page-title">Charges</h1>
      <p className="page-subtitle">Flat 1A · charge lines on one ledger.</p>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          Add charge
        </button>
      </div>
      <div className="data-table-wrap" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Due</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mockCharges.map((c) => (
              <tr key={c.id}>
                <td>{c.type}</td>
                <td className="mono-data">{c.due}</td>
                <td className="mono-data">{formatNaira(c.amount)}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
