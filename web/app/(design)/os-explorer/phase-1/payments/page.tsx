import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { formatNaira, mockPayments } from "../../mock/data";

export default function Phase1PaymentsPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1/unit">Unit</Link> · Payments · PRD
        F2/F3
      </p>
      <h1 className="page-title">Payments</h1>
      <p className="page-subtitle">
        Manual log is primary for cash; Paystack is alternate. Same history.
      </p>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-1/payments" className="btn-primary">
          Record manual payment
        </Link>
        <button type="button" className="btn-secondary">
          Paystack
        </button>
      </div>
      <div className="data-table-wrap" style={{ marginTop: 20 }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Unit</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {mockPayments.map((p) => (
              <tr key={p.id}>
                <td className="mono-data">{p.date}</td>
                <td>{p.unit}</td>
                <td className="mono-data">{formatNaira(p.amount)}</td>
                <td>{p.method}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  {p.status === "PAID" ? (
                    <button type="button" className="btn-table-cta">
                      Open receipt
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="osx-muted" style={{ marginTop: 16 }}>
        Wireframe: form success would append a PAID row and reset — mock only.
      </p>
    </>
  );
}
