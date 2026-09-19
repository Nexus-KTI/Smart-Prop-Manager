"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { FetchErrorState } from "@/components/FetchErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import {
  fetchPortfolioPaymentsPage,
  fetchUrgentActions,
  type UrgentActionItem,
} from "@/lib/api";
import {
  CHANNEL_LABELS,
  labelOrTitle,
} from "@/lib/labels";
import { chargeTypeLabel, formatNaira } from "@/lib/dashboard";
import type { PortfolioPayment, UnitStatus } from "@/lib/types";

type ListFilter = "money_in" | "OVERDUE" | "DUE SOON";

type OweRow = {
  id: string;
  label: string;
  tenant: string;
  status: UnitStatus;
  detail?: string;
};

function formatWhen(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function unitLabel(row: PortfolioPayment): string {
  const property = (row.property_name || "").trim();
  const unit = (row.unit_label || "").trim();
  if (property && unit) return `${property} · ${unit}`;
  return property || unit || "Unit";
}

function actionUnitLine(item: UrgentActionItem): string {
  const prop = (item.property_name || "").trim();
  const label = (item.unit_label || "Unit").trim();
  return prop ? `${prop} · ${label}` : label;
}

function isOverdueKind(kind: string): boolean {
  return kind === "overdue_chase" || kind === "overdue_no_contact";
}

/** One row per unit for overdue / due-soon tabs (actions may emit multiple kinds). */
function oweRowsFromActions(items: UrgentActionItem[]): {
  overdue: OweRow[];
  dueSoon: OweRow[];
} {
  const overdueMap = new Map<string, OweRow>();
  const dueSoonMap = new Map<string, OweRow>();

  for (const item of items) {
    const unitId = item.unit_id;
    if (!unitId) continue;
    if (isOverdueKind(item.kind)) {
      if (!overdueMap.has(unitId)) {
        overdueMap.set(unitId, {
          id: unitId,
          label: actionUnitLine(item),
          tenant: item.tenant_name?.trim() || "-",
          status: "OVERDUE",
          detail: item.detail || undefined,
        });
      }
    } else if (item.kind === "due_soon") {
      if (!dueSoonMap.has(unitId)) {
        dueSoonMap.set(unitId, {
          id: unitId,
          label: actionUnitLine(item),
          tenant: item.tenant_name?.trim() || "-",
          status: "DUE SOON",
          detail: item.detail || undefined,
        });
      }
    }
  }

  return {
    overdue: [...overdueMap.values()],
    dueSoon: [...dueSoonMap.values()],
  };
}

export default function PaymentsPage() {
  const [items, setItems] = useState<PortfolioPayment[]>([]);
  const [overdueRows, setOverdueRows] = useState<OweRow[]>([]);
  const [dueSoonRows, setDueSoonRows] = useState<OweRow[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [dueSoonCount, setDueSoonCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [listFilter, setListFilter] = useState<ListFilter>("money_in");

  const firstOverdueUnitId = overdueRows[0]?.id ?? null;

  const loadPage = useCallback(async (cursor?: string | null) => {
    const page = await fetchPortfolioPaymentsPage(cursor);
    setItems((current) => (cursor ? [...current, ...page.items] : page.items));
    setNextCursor(page.next_cursor);
  }, []);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadPage(null);
        try {
          const actions = await fetchUrgentActions();
          if (!active) return;
          const { overdue, dueSoon } = oweRowsFromActions(actions.items);
          setOverdueRows(overdue);
          setDueSoonRows(dueSoon);
          setOverdueCount(actions.summary.overdue);
          setDueSoonCount(actions.summary.due_soon);
          setFailedCount(actions.summary.failed);
        } catch {
          if (active) {
            setOverdueRows([]);
            setDueSoonRows([]);
            setOverdueCount(0);
            setDueSoonCount(0);
            setFailedCount(0);
          }
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load money-in feed",
          );
          setItems([]);
          setOverdueRows([]);
          setDueSoonRows([]);
          setOverdueCount(0);
          setDueSoonCount(0);
          setFailedCount(0);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadPage, reloadKey]);

  const visibleOweRows = useMemo(() => {
    if (listFilter === "OVERDUE") return overdueRows;
    if (listFilter === "DUE SOON") return dueSoonRows;
    return [];
  }, [listFilter, overdueRows, dueSoonRows]);

  const hasOweSignal = overdueCount > 0 || dueSoonCount > 0;

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextCursor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more payments",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (
    !loading &&
    error &&
    items.length === 0 &&
    overdueRows.length === 0 &&
    dueSoonRows.length === 0
  ) {
    return (
      <FetchErrorState
        title="Couldn’t load money in"
        message={error}
        onRetry={retry}
      />
    );
  }

  const showSegment = !loading && (items.length > 0 || hasOweSignal);

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Recent money in across your units. Open a unit to record a payment.
          </p>
        </div>
        <div className="dashboard-header-actions">
          {overdueCount > 0 ? (
            <Link href="/reminders?filter=overdue" className="btn-secondary">
              {overdueCount} overdue → Chase
            </Link>
          ) : (
            <Link href="/reminders" className="btn-secondary">
              Reminders
            </Link>
          )}
          <Link href="/properties" className="btn-secondary">
            Properties
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {(overdueCount > 0 || failedCount > 0) && !loading ? (
        <p className="page-subtitle" role="status">
          {overdueCount > 0
            ? overdueCount === 1
              ? "1 unit is overdue."
              : `${overdueCount} units are overdue.`
            : null}
          {overdueCount > 0 && failedCount > 0 ? " " : null}
          {failedCount > 0
            ? failedCount === 1
              ? "1 chase send failed."
              : `${failedCount} chase sends failed.`
            : null}{" "}
          {overdueCount > 0 && firstOverdueUnitId ? (
            <>
              <Link
                href={`/payments/${firstOverdueUnitId}`}
                className="table-link"
              >
                Open overdue unit
              </Link>
              {" · "}
            </>
          ) : null}
          {overdueCount > 0 ? (
            <>
              <Link href="/reminders?filter=overdue" className="table-link">
                Chase on Reminders
              </Link>
              {failedCount > 0 ? " · " : null}
            </>
          ) : null}
          {failedCount > 0 ? (
            <Link href="/reminders?filter=failed" className="table-link">
              Retry on Action needed
            </Link>
          ) : null}
          {overdueCount > 0 ? (
            <>
              {" · "}
              <Link href="/ops" className="table-link">
                Across owners
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {showSegment ? (
        <div className="portfolio-occupancy-bar">
          <p className="form-label" id="payments-list-label">
            Show
          </p>
          <div
            className="theme-segment"
            role="group"
            aria-labelledby="payments-list-label"
          >
            {(
              [
                ["money_in", "Money in", items.length],
                ["OVERDUE", "Overdue", overdueCount],
                ["DUE SOON", "Due soon", dueSoonCount],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                className="theme-segment-btn"
                data-active={listFilter === id ? "true" : "false"}
                aria-pressed={listFilter === id}
                onClick={() => setListFilter(id)}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Charge</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              <TableSkeleton columns={7} rows={6} />
            </tbody>
          </table>
        </div>
      ) : listFilter !== "money_in" ? (
        visibleOweRows.length === 0 ? (
          <div className="dashboard-empty" role="status">
            <p className="dashboard-empty-title mono-data">
              {listFilter === "OVERDUE"
                ? "No overdue units."
                : "No due-soon units."}
            </p>
            <p className="dashboard-empty-copy">
              Switch to Money in to see recorded payments.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setListFilter("money_in")}
            >
              Show money in
            </button>
          </div>
        ) : (
          <div className="data-table-wrap data-table-wrap--stack">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Why</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOweRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        href={`/payments/${row.id}`}
                        className="table-link"
                      >
                        {row.label}
                      </Link>
                    </td>
                    <td>{row.tenant}</td>
                    <td>{row.detail || "-"}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          row.status === "OVERDUE" ? "overdue" : "due-soon"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link
                          href={`/payments/${row.id}`}
                          className="btn-secondary btn-table-cta"
                        >
                          Record payment
                        </Link>
                        <Link
                          href={`/reminders/${row.id}`}
                          className="table-link"
                        >
                          Remind
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : items.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No money in yet.</p>
          <p className="dashboard-empty-copy">
            Log cash, transfer, or Paystack on a unit and it shows up here.
          </p>
          {firstOverdueUnitId ? (
            <Link
              href={`/payments/${firstOverdueUnitId}`}
              className="btn-primary"
            >
              Open overdue unit
            </Link>
          ) : overdueCount > 0 ? (
            <Link href="/reminders?filter=overdue" className="btn-primary">
              Chase overdue
            </Link>
          ) : (
            <Link href="/properties" className="btn-primary">
              Go to properties
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="data-table-wrap data-table-wrap--stack">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Charge</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const receiptUrl = row.receipt_url?.trim() ?? "";
                  const hasReceipt = /^https?:\/\//i.test(receiptUrl);
                  return (
                    <tr key={row.id}>
                      <td className="mono-data">
                        {formatWhen(row.paid_at || row.created_at)}
                      </td>
                      <td>
                        {row.unit_id ? (
                          <Link
                            href={`/payments/${row.unit_id}`}
                            className="table-link"
                          >
                            {unitLabel(row)}
                          </Link>
                        ) : (
                          unitLabel(row)
                        )}
                      </td>
                      <td>{row.tenant_name?.trim() || "-"}</td>
                      <td>
                        {chargeTypeLabel(row.charge_type, row.charge_label)}
                      </td>
                      <td className="mono-data">
                        {formatNaira(Number(row.amount) || 0)}
                      </td>
                      <td>
                        {labelOrTitle(CHANNEL_LABELS, row.method, "-")}
                      </td>
                      <td>
                        {hasReceipt ? (
                          <a
                            href={receiptUrl}
                            className="table-link"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open receipt
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <LoadMoreButton
            hasMore={Boolean(nextCursor)}
            loading={loadingMore}
            onLoadMore={() => void onLoadMore()}
          />
        </>
      )}
    </section>
  );
}
