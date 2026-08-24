"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { PropertiesDashboard } from "@/components/PropertiesDashboard";
import { TableSkeleton } from "@/components/TableSkeleton";
import { buildDashboardFromPortfolio } from "@/lib/dashboard";
import {
  fetchPortfolioUnitsPage,
  fetchPropertiesPage,
} from "@/lib/api";
import type { PortfolioUnit, Property } from "@/lib/types";

function emptyPropertiesFromPage(items: Property[]): Property[] {
  return items.filter((property) => !(property.units?.length ?? 0));
}

function propertiesForChecklist(
  portfolioUnits: PortfolioUnit[],
  emptyProperties: Property[],
): Property[] {
  const map = new Map<string, Property>();

  for (const property of emptyProperties) {
    map.set(property.id, {
      ...property,
      units: [],
    });
  }

  for (const item of portfolioUnits) {
    const existing = map.get(item.property_id);
    if (existing) {
      existing.units = [...(existing.units ?? []), item.unit];
      continue;
    }
    map.set(item.property_id, {
      id: item.property_id,
      owner_id: "",
      name: item.property_name,
      type: "rental",
      units: [item.unit],
    });
  }

  return [...map.values()];
}

function PropertiesSkeleton() {
  return (
    <section className="dashboard" aria-busy="true" aria-label="Loading properties">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">
            Units, rent, and payment status across your portfolio.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/properties/new" className="btn-primary">
            Add property
          </Link>
        </div>
      </header>

      <div className="stat-row">
        <div className="stat-block">
          <p className="stat-label">Total Collected</p>
          <p className="stat-value mono-data">
            <span className="skeleton-bar" style={{ width: "56%" }} />
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Outstanding</p>
          <p className="stat-value mono-data">
            <span className="skeleton-bar" style={{ width: "48%" }} />
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Units Overdue</p>
          <p className="stat-value mono-data">
            <span className="skeleton-bar" style={{ width: "28%" }} />
          </p>
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Tenant</th>
              <th>Rent</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <TableSkeleton columns={6} rows={6} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PropertiesPageInner() {
  const searchParams = useSearchParams();
  const highlightUnitId = searchParams.get("highlight");
  const highlightPropertyId = searchParams.get("highlightProperty");

  const [portfolioUnits, setPortfolioUnits] = useState<PortfolioUnit[]>([]);
  const [emptyProperties, setEmptyProperties] = useState<Property[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const dashboard = useMemo(
    () => buildDashboardFromPortfolio(portfolioUnits, emptyProperties),
    [portfolioUnits, emptyProperties],
  );

  const checklistProperties = useMemo(
    () => propertiesForChecklist(portfolioUnits, emptyProperties),
    [portfolioUnits, emptyProperties],
  );

  const loadInitial = useCallback(async () => {
    const [unitsPage, propertiesPage] = await Promise.all([
      fetchPortfolioUnitsPage(null),
      fetchPropertiesPage(null),
    ]);
    setPortfolioUnits(unitsPage.items);
    setNextCursor(unitsPage.next_cursor);
    setEmptyProperties(emptyPropertiesFromPage(propertiesPage.items));
  }, []);

  const loadMoreUnits = useCallback(async (cursor: string) => {
    const page = await fetchPortfolioUnitsPage(cursor);
    setPortfolioUnits((current) => [...current, ...page.items]);
    setNextCursor(page.next_cursor);
  }, []);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        await loadInitial();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load properties",
          );
          setPortfolioUnits([]);
          setEmptyProperties([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadInitial, reloadKey]);

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadMoreUnits(nextCursor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more units",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return <PropertiesSkeleton />;
  }

  if (error && portfolioUnits.length === 0 && emptyProperties.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load properties"
        message={error}
        onRetry={retry}
      />
    );
  }

  return (
    <>
      {error ? <p className="form-error">{error}</p> : null}
      <PropertiesDashboard
        rows={dashboard.rows}
        stats={dashboard.stats}
        properties={checklistProperties}
        highlightUnitId={highlightUnitId}
        highlightPropertyId={highlightPropertyId}
        hasMore={Boolean(nextCursor)}
        loadingMore={loadingMore}
        onLoadMore={() => void onLoadMore()}
      />
    </>
  );
}

export default function PropertiesPage() {
  return (
    <Suspense fallback={<PropertiesSkeleton />}>
      <PropertiesPageInner />
    </Suspense>
  );
}
