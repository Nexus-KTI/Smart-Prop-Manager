"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchRentRoll, type RentRollReport } from "@/lib/api";

export function ReportsClient() {
  const [report, setReport] = useState<RentRollReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchRentRoll());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Rent roll</h1>
        <p className="page-subtitle">
          Occupancy snapshot plus this month’s expense total.
        </p>
      </header>
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {report ? (
        <>
          <p className="page-subtitle">
            Occupied {report.occupied} · Vacant {report.vacant} · Month expenses{" "}
            ₦{Number(report.month_expenses_total).toLocaleString()}
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Unit</th>
                  <th>Rent</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Term end</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((row) => (
                  <tr key={row.unit_id}>
                    <td>{row.property_name || "-"}</td>
                    <td>{row.unit_label || "-"}</td>
                    <td>
                      {row.rent_amount != null
                        ? `${row.currency} ${Number(row.rent_amount).toLocaleString()}`
                        : "-"}
                      {row.frequency ? (
                        <span className="table-muted"> / {row.frequency}</span>
                      ) : null}
                    </td>
                    <td>
                      {row.tenant_name || "-"}
                      {row.tenant_contact ? (
                        <span className="table-muted"> · {row.tenant_contact}</span>
                      ) : null}
                    </td>
                    <td>{row.tenancy_status || "vacant"}</td>
                    <td>{row.term_end || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
