"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { fetchPortfolioTenancies, type PortfolioTenancy } from "@/lib/api";
import { tenancyStatusLabel, tenancyStatusTone } from "@/lib/labels";

export function TenanciesListClient() {
  const [items, setItems] = useState<PortfolioTenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchPortfolioTenancies());
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
        <h1 className="page-title">Tenancies</h1>
        <p className="page-subtitle">All occupancy records across your portfolio.</p>
      </header>
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Unit</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>Term end</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>{t.property_name || "-"}</td>
                <td>{t.unit_label || "-"}</td>
                <td>
                  {t.tenant_name || "-"}
                  {t.tenant_contact ? (
                    <span className="table-muted"> · {t.tenant_contact}</span>
                  ) : null}
                </td>
                <td>
                  <span className={`status-badge ${tenancyStatusTone(t.status)}`}>
                    {tenancyStatusLabel(t.status)}
                  </span>
                </td>
                <td>{t.term_end || "-"}</td>
                <td>
                  {t.property_id ? (
                    <Link
                      href={`/properties/${t.property_id}/units/${t.unit_id}/tenancy`}
                      className="table-link"
                    >
                      Open
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && items.length === 0 ? (
        <div className="empty-state">
          <p className="table-muted" style={{ margin: 0 }}>
            No tenancies yet. Open a unit → start tenancy &amp; send the claim
            invite. Tenancies appear here after that, even before the tenant
            claims.
          </p>
          <p style={{ margin: "12px 0 0" }}>
            <Link href="/properties" className="btn-secondary">
              Go to properties
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}
