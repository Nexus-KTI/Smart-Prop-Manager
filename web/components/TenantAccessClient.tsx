"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { fetchMyAccessPasses, type AccessPass } from "@/lib/api";

export function TenantAccessClient() {
  const [items, setItems] = useState<AccessPass[]>([]);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyAccessPasses();
      setItems(data.items);
      setListCapped(data.capped);
      setListLoaded(data.loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="page-subtitle">Loading access…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load access"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  const active = items.filter((i) => (i.effective_status || i.status) === "active");

  return (
    <section className="dashboard">
      <h1 className="page-title">Gate codes</h1>
      <p className="page-subtitle">
        Gate codes your landlord issued for you. Show the code at the estate gate.
      </p>
      {listCapped ? (
        <p className="page-subtitle" role="status">
          Showing the {listLoaded} most recent codes. Older passes may not
          appear here.
        </p>
      ) : null}

      {active.length === 0 ? (
        <div className="tenant-module-banner" data-tone="wait" role="status">
          <p className="tenant-module-banner-title">No active codes</p>
          <p className="page-subtitle" style={{ margin: 0 }}>
            When your landlord issues a pass linked to your account, it appears here.
          </p>
        </div>
      ) : (
        <ul className="tenant-notice-list">
          {active.map((row) => (
            <li key={row.id} className="tenant-notice-card">
              <h2 className="tenant-notice-title">{row.subject_label}</h2>
              <p className="stat-value mono-data" style={{ fontSize: "1.5rem" }}>
                {row.code}
              </p>
              <p className="table-muted">
                Valid until {new Date(row.valid_until).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p style={{ marginTop: 16 }}>
        <Link href="/tenant" className="table-link">
          Back to home
        </Link>
      </p>
    </section>
  );
}
