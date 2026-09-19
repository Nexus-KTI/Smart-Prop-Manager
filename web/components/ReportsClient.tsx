"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { fetchRentRoll, type RentRollReport } from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";
import { tenancyStatusLabel, tenancyStatusTone } from "@/lib/labels";

export function ReportsClient() {
  const [report, setReport] = useState<RentRollReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchRentRoll());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (!loading && error && !report) {
    return (
      <FetchErrorState
        title="Couldn’t load rent roll"
        message={error}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  const items = report?.items ?? [];
  const emptyPortfolio = !loading && report && items.length === 0;

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Rent roll</h1>
          <p className="page-subtitle">
            Occupancy snapshot plus this month’s expense total.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/expenses" className="btn-secondary">
            Expenses
          </Link>
          <Link href="/payments" className="btn-secondary">
            Payments
          </Link>
          <Link href="/properties" className="btn-primary">
            Properties
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {report?.capped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing {report.loaded ?? items.length} units on this roll (list may
          stop at 500). Occupancy counts are for the loaded rows only.
        </p>
      ) : null}
      {report?.expenses_capped && !loading ? (
        <p className="page-subtitle" role="status">
          This month’s expense total may be incomplete (expense sum capped at
          500 rows). See Expenses for the loaded ledger.
        </p>
      ) : null}

      {emptyPortfolio ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No units yet.</p>
          <p className="dashboard-empty-copy">
            Add a property and unit to see occupancy and rent on this roll.
          </p>
          <Link href="/properties/new" className="btn-primary">
            Add a property
          </Link>
        </div>
      ) : null}

      {report && items.length > 0 ? (
        <>
          <p className="page-subtitle" role="status">
            Occupied {report.occupied} · Vacant {report.vacant} · Month expenses{" "}
            <Link href="/expenses" className="table-link mono-data">
              {formatNaira(Number(report.month_expenses_total) || 0)}
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
                  <th>Term end</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const vacant = !row.tenancy_status;
                  const tenancyHref = row.property_id
                    ? `/properties/${row.property_id}/units/${row.unit_id}/tenancy`
                    : null;
                  return (
                    <tr key={row.unit_id}>
                      <td>{row.property_name || "-"}</td>
                      <td>
                        <Link
                          href={`/payments/${row.unit_id}`}
                          className="table-link"
                        >
                          {row.unit_label || "Unit"}
                        </Link>
                      </td>
                      <td className="mono-data">
                        {row.rent_amount != null
                          ? formatNaira(Number(row.rent_amount) || 0)
                          : "-"}
                        {row.frequency ? (
                          <span className="table-muted"> / {row.frequency}</span>
                        ) : null}
                      </td>
                      <td>
                        {row.tenant_name || "-"}
                        {row.tenant_contact ? (
                          <span className="table-muted">
                            {" "}
                            · {row.tenant_contact}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {vacant ? (
                          <span className="status-badge pending">VACANT</span>
                        ) : (
                          <span
                            className={`status-badge ${tenancyStatusTone(row.tenancy_status)}`}
                          >
                            {tenancyStatusLabel(row.tenancy_status)}
                          </span>
                        )}
                      </td>
                      <td className="mono-data">{row.term_end || "-"}</td>
                      <td>
                        <div className="table-actions">
                          <Link
                            href={`/payments/${row.unit_id}`}
                            className="table-link"
                          >
                            Payments
                          </Link>
                          {tenancyHref ? (
                            <Link href={tenancyHref} className="table-link">
                              {vacant ? "Start tenancy" : "Tenancy"}
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
