"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  fetchPortfolioTenancies,
  fetchUrgentActionsSummary,
  type PortfolioTenancy,
} from "@/lib/api";
import { parseTermEnd } from "@/lib/dashboard";
import { tenancyStatusLabel, tenancyStatusTone } from "@/lib/labels";

type ListFilter = "all" | "active" | "ending_soon";

const FILTERS: ListFilter[] = ["all", "active", "ending_soon"];
/** Matches `LEASE_ENDING_DAYS` in lib/urgent_actions.py (inclusive, not yet ended). */
const ENDING_SOON_DAYS = 60;

function parseFilter(raw: string | null): ListFilter {
  if (raw && FILTERS.includes(raw as ListFilter)) return raw as ListFilter;
  return "all";
}

function daysUntilTermEnd(termEnd?: string | null): number | null {
  const end = parseTermEnd(termEnd);
  if (!end) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function isEndingSoon(t: PortfolioTenancy): boolean {
  const days = daysUntilTermEnd(t.term_end);
  if (days == null) return false;
  return days >= 0 && days <= ENDING_SOON_DAYS;
}

function isActiveStatus(status: string): boolean {
  return (status || "").toLowerCase() === "active";
}

function formatTermEnd(termEnd?: string | null): string {
  if (!termEnd) return "-";
  const end = parseTermEnd(termEnd);
  if (!end) return termEnd;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(end);
}

export function TenanciesListClient() {
  return (
    <Suspense
      fallback={
        <section className="dashboard">
          <header className="dashboard-header">
            <h1 className="page-title">Tenancies</h1>
            <p className="page-subtitle">Loading…</p>
          </header>
        </section>
      }
    >
      <TenanciesListInner />
    </Suspense>
  );
}

function TenanciesListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<PortfolioTenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>(() =>
    parseFilter(searchParams.get("filter")),
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [actionsLeaseEnding, setActionsLeaseEnding] = useState<number | null>(
    null,
  );
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortfolioTenancies();
      setItems(data.items);
      setListCapped(data.capped);
      setListLoaded(data.loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
      setItems([]);
      setListCapped(false);
      setListLoaded(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const summary = await fetchUrgentActionsSummary();
        if (!active) return;
        setActionsLeaseEnding(summary.lease_ending);
      } catch {
        // Keep null so chip falls back to loaded-row count.
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    const next = parseFilter(searchParams.get("filter"));
    setListFilter(next);
  }, [searchParams]);

  function setFilter(next: ListFilter) {
    setListFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("filter");
    else params.set("filter", next);
    const qs = params.toString();
    router.replace(qs ? `/tenancies?${qs}` : "/tenancies", { scroll: false });
  }

  const counts = useMemo(() => {
    let active = 0;
    let endingSoonLocal = 0;
    for (const t of items) {
      if (isActiveStatus(t.status)) active += 1;
      if (isEndingSoon(t)) endingSoonLocal += 1;
    }
    return {
      all: items.length,
      active,
      endingSoon: actionsLeaseEnding ?? endingSoonLocal,
    };
  }, [items, actionsLeaseEnding]);

  const leaseEndingSignal = actionsLeaseEnding ?? 0;

  const visible = useMemo(() => {
    if (listFilter === "active") {
      return items.filter((t) => isActiveStatus(t.status));
    }
    if (listFilter === "ending_soon") {
      return items.filter((t) => isEndingSoon(t));
    }
    return items;
  }, [items, listFilter]);

  function emptyFilterCopy(): ReactNode {
    if (listFilter === "ending_soon" && leaseEndingSignal > 0) {
      return (
        <>
          No leases ending within 60 days match this loaded list.{" "}
          <Link href="/reminders?filter=ending_soon" className="table-link">
            Open Action needed
          </Link>
          .
        </>
      );
    }
    if (listFilter === "ending_soon") {
      return "No leases ending within 60 days. Switch to All.";
    }
    if (listFilter === "active") {
      return "No active tenancies in this list. Switch to All.";
    }
    return "No tenancies to show.";
  }

  if (!loading && error && items.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load tenancies"
        message={error}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Tenancies</h1>
          <p className="page-subtitle">
            Occupancy, invites, and term end across your portfolio.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/properties?occupancy=vacant" className="btn-secondary">
            Vacant units
          </Link>
          <Link href="/properties" className="btn-primary">
            Properties
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? <p className="page-subtitle">Loading…</p> : null}

      {listCapped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {listLoaded} most recent tenancies. All/Active counts are
          for this loaded list; Ending soon uses Action needed.
        </p>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No tenancies yet.</p>
          <p className="dashboard-empty-copy">
            Open a vacant unit on Properties, start a tenancy, and send the claim
            invite.
          </p>
          <Link href="/properties?occupancy=vacant" className="btn-primary">
            Find vacant units
          </Link>
        </div>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="portfolio-occupancy-bar">
            <p className="form-label" id="tenancies-filter-label">
              Show
            </p>
            <div
              className="theme-segment"
              role="group"
              aria-labelledby="tenancies-filter-label"
            >
              {(
                [
                  ["all", "All", counts.all],
                  ["active", "Active", counts.active],
                  ["ending_soon", "Ending soon", counts.endingSoon],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  className="theme-segment-btn"
                  data-active={listFilter === id ? "true" : "false"}
                  aria-pressed={listFilter === id}
                  onClick={() => setFilter(id)}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Term end</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      {emptyFilterCopy()}
                    </td>
                  </tr>
                ) : null}
                {visible.map((t) => {
                  const days = daysUntilTermEnd(t.term_end);
                  const endingSoon = isEndingSoon(t);
                  const tenancyHref = t.property_id
                    ? `/properties/${t.property_id}/units/${t.unit_id}/tenancy`
                    : null;
                  return (
                    <tr key={t.id}>
                      <td>{t.property_name || "-"}</td>
                      <td>{t.unit_label || "-"}</td>
                      <td>
                        {t.tenant_name || "-"}
                        {t.tenant_contact ? (
                          <span className="table-muted">
                            {" "}
                            · {t.tenant_contact}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${tenancyStatusTone(t.status)}`}
                        >
                          {tenancyStatusLabel(t.status)}
                        </span>
                        {endingSoon && days != null ? (
                          <p
                            className="table-muted"
                            style={{ margin: "2px 0 0" }}
                          >
                            {days === 0 ? "Ends today" : `${days}d left`}
                          </p>
                        ) : null}
                      </td>
                      <td className="mono-data">{formatTermEnd(t.term_end)}</td>
                      <td>
                        <div className="table-actions">
                          {tenancyHref ? (
                            <Link href={tenancyHref} className="table-link">
                              Open
                            </Link>
                          ) : null}
                          <Link
                            href={`/payments/${t.unit_id}`}
                            className="table-link"
                          >
                            Payments
                          </Link>
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
