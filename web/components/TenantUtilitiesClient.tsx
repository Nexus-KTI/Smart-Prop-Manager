"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { TenantLeaseGate } from "@/components/TenantLeaseGate";
import { fetchMyUtilities, type UtilityProvider } from "@/lib/api";

const KIND_LABELS: Record<string, string> = {
  power: "Power",
  water: "Water",
  waste: "Waste",
  diesel_generator: "Generator / diesel",
  internet: "Internet",
  other: "Other",
};

export function TenantUtilitiesClient() {
  const [items, setItems] = useState<UtilityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchMyUtilities());
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
    <TenantLeaseGate
      title="Utilities"
      subtitle="Providers and setup for power, water, and other estate services."
    >
      {() => (
        <>
          {loading ? <p className="page-subtitle">Loading…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}

          {!loading && items.length === 0 ? (
            <div className="tenant-module-banner" data-tone="wait" role="status">
              <p className="tenant-module-banner-title">
                Not set up on the landlord side yet
              </p>
              <p className="page-subtitle" style={{ margin: 0 }}>
                Utility providers appear here after your landlord publishes them
                for your unit. Ask them to enable utilities on Payments.
              </p>
            </div>
          ) : null}

          {!loading && items.length > 0 ? (
            <>
              <div className="tenant-module-banner" data-tone="info" role="status">
                <p className="tenant-module-banner-title">Utilities ready</p>
                <p className="page-subtitle" style={{ margin: 0 }}>
                  Your landlord published the providers below.
                </p>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kind</th>
                      <th>Provider</th>
                      <th>How to pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <td>{KIND_LABELS[row.kind] || row.kind}</td>
                        <td>
                          <strong>{row.provider_name}</strong>
                          {row.account_or_meter ? (
                            <p className="table-muted" style={{ margin: "4px 0 0" }}>
                              Meter / account: {row.account_or_meter}
                            </p>
                          ) : null}
                          {row.notes ? (
                            <p className="table-muted" style={{ margin: "4px 0 0" }}>
                              {row.notes}
                            </p>
                          ) : null}
                        </td>
                        <td>{row.how_to_pay || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="dashboard-header-actions" style={{ marginTop: 16 }}>
            <Link href="/tenant" className="btn-secondary">
              Back to home
            </Link>
            <Link href="/tenant/notices" className="btn-secondary">
              Notices
            </Link>
          </div>
        </>
      )}
    </TenantLeaseGate>
  );
}
