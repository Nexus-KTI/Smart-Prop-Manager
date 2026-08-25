"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { fetchStaffPortfolios, type StaffPortfolio } from "@/lib/api";
import {
  readPortfolioOwnerId,
  writePortfolioOwnerId,
} from "@/lib/portfolio";
import { STAFF_ROLE_LABELS, labelOrTitle } from "@/lib/labels";

export function PortfolioSwitcherClient() {
  const [items, setItems] = useState<StaffPortfolio[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const portfolios = await fetchStaffPortfolios();
      setItems(portfolios);
      const stored = readPortfolioOwnerId();
      if (stored && portfolios.some((p) => p.owner_id === stored)) {
        setActive(stored);
      } else if (portfolios[0]) {
        setActive(portfolios[0].owner_id);
        writePortfolioOwnerId(portfolios[0].owner_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function switchTo(ownerId: string) {
    writePortfolioOwnerId(ownerId);
    setActive(ownerId);
  }

  if (loading) return <p className="page-subtitle">Loading portfolios…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load portfolios"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Switch owner</h1>
        <p className="page-subtitle">
          Managers see only portfolios they’re granted. Owners see their own.
        </p>
      </header>
      <ul className="tenancy-doc-list">
        {items.map((p) => {
          const isCurrent = p.owner_id === active;
          return (
            <li key={`${p.owner_id}-${p.role}`}>
              <div>
                <div>{p.owner_label || "Owner"}</div>
                <div className="table-muted">
                  {labelOrTitle(STAFF_ROLE_LABELS, p.role)} · {p.property_count}{" "}
                  {p.property_count === 1 ? "property" : "properties"}
                </div>
              </div>
              {isCurrent ? (
                <span className="status-badge paid">Current</span>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => switchTo(p.owner_id)}
                >
                  Switch owner
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p style={{ marginTop: 16 }}>
        <Link href="/ops" className="table-link">
          Back to chase ops
        </Link>
      </p>
    </section>
  );
}
