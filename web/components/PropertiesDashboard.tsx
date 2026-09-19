"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { fetchUrgentActionsSummary } from "@/lib/api";
import {
  formatDueDate,
  formatNaira,
} from "@/lib/dashboard";
import type {
  DashboardRow,
  DashboardStats,
  Property,
  UnitStatus,
} from "@/lib/types";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { ListPagination } from "@/components/ListPagination";

type OccupancyFilter = "all" | "occupied" | "vacant";
type PaymentFilter = "all" | UnitStatus;

const LIST_PAGE_SIZE = 10;

function rowIsVacant(row: DashboardRow): boolean {
  if (row.needsUnit) return true;
  const tenant = (row.tenant || "").trim();
  return !tenant || tenant === "-";
}

function rowHasPaymentStatus(row: DashboardRow): boolean {
  return !row.needsUnit && Boolean(row.unitId);
}

function StatusBadge({ status }: { status: UnitStatus }) {
  const tone =
    status === "PAID"
      ? "paid"
      : status === "OVERDUE"
        ? "overdue"
        : status === "DUE SOON"
          ? "due-soon"
          : "pending";
  return <span className={`status-badge ${tone}`}>{status}</span>;
}

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  href: string | null;
};

function buildGettingStarted(properties: Property[]): {
  unitCount: number;
  items: ChecklistItem[];
} {
  let unitCount = 0;
  let firstUnitId: string | null = null;
  let hasPayment = false;

  for (const property of properties) {
    for (const unit of property.units ?? []) {
      unitCount += 1;
      if (!firstUnitId) firstUnitId = unit.id;
      if (
        !hasPayment &&
        (unit.transactions ?? []).some((txn) => txn.status === "paid")
      ) {
        hasPayment = true;
      }
    }
  }

  const firstPropertyId = properties[0]?.id ?? null;
  const hasProperty = properties.length > 0;

  const items: ChecklistItem[] = [
    {
      id: "property",
      label: "Add your first property",
      done: hasProperty,
      href: hasProperty ? null : "/onboarding",
    },
    {
      id: "unit",
      label: "Add a unit",
      done: unitCount > 0,
      href:
        unitCount > 0
          ? null
          : firstPropertyId
            ? `/properties/${firstPropertyId}/units/new`
            : "/onboarding",
    },
    {
      id: "payment",
      label: "Record your first payment",
      done: hasPayment,
      // Only link once a unit exists, otherwise the prior step is the action.
      href: hasPayment || !firstUnitId ? null : `/payments/${firstUnitId}`,
    },
  ];

  return { unitCount, items };
}

function GettingStartedChecklist({ items }: { items: ChecklistItem[] }) {
  const activeIndex = items.findIndex((item) => !item.done);

  return (
    <div className="dashboard-checklist" role="status">
      <p className="dashboard-checklist-title">Getting started</p>
      <ol className="dashboard-checklist-list">
        {items.map((item, index) => {
          const state =
            item.done
              ? "complete"
              : index === activeIndex
                ? "active"
                : "upcoming";
          return (
            <li
              key={item.id}
              className="dashboard-checklist-item"
              data-state={state}
            >
              <span className="onboarding-step-dot" aria-hidden>
                {item.done ? "✓" : index + 1}
              </span>
              {item.done || !item.href ? (
                <span className="dashboard-checklist-label">{item.label}</span>
              ) : (
                <Link href={item.href} className="dashboard-checklist-link">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Props = {
  rows: DashboardRow[];
  stats: DashboardStats;
  /** For getting-started checklist and add-unit links. */
  properties: Property[];
  highlightUnitId?: string | null;
  highlightPropertyId?: string | null;
  initialOccupancy?: OccupancyFilter;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
};

export function PropertiesDashboard({
  rows,
  stats,
  properties,
  highlightUnitId = null,
  highlightPropertyId = null,
  initialOccupancy = "all",
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: Props) {
  const normalized = properties.map((property) => ({
    ...property,
    units: Array.isArray(property.units) ? property.units : [],
  }));
  const { items: checklistItems } = buildGettingStarted(normalized);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const firstPropertyId = normalized[0]?.id;
  const addUnitHref = firstPropertyId
    ? `/properties/${firstPropertyId}/units/new`
    : "/onboarding";
  const gettingStartedComplete = checklistItems.every((item) => item.done);
  // Checklist may guide next steps after Skip, but must never replace the table
  // when any property row exists (including zero-unit / needsUnit rows).
  const showChecklist = !gettingStartedComplete;
  const showTable = rows.length > 0;
  const showHeaderActions = normalized.length > 0;

  const [occupancyFilter, setOccupancyFilter] =
    useState<OccupancyFilter>(initialOccupancy);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [listPage, setListPage] = useState(1);
  /** Portfolio-wide chase counts from Action needed; null until first fetch. */
  const [actionsOverdue, setActionsOverdue] = useState<number | null>(null);
  const [actionsDueSoon, setActionsDueSoon] = useState<number | null>(null);
  const [actionsFailed, setActionsFailed] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const summary = await fetchUrgentActionsSummary();
        if (!active) return;
        setActionsOverdue(summary.overdue);
        setActionsDueSoon(summary.due_soon);
        setActionsFailed(summary.failed);
      } catch {
        if (!active) return;
        // Keep null so chip/header fall back to loaded-row stats.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const occupancyCounts = useMemo(() => {
    let occupied = 0;
    let vacant = 0;
    for (const row of rows) {
      if (rowIsVacant(row)) vacant += 1;
      else occupied += 1;
    }
    return { all: rows.length, occupied, vacant };
  }, [rows]);

  const paymentCounts = useMemo(() => {
    const counts: Record<UnitStatus, number> = {
      PAID: 0,
      OVERDUE: 0,
      "DUE SOON": 0,
      PENDING: 0,
    };
    let withStatus = 0;
    for (const row of rows) {
      if (!rowHasPaymentStatus(row)) continue;
      withStatus += 1;
      counts[row.status] += 1;
    }
    return {
      all: withStatus,
      overdue: actionsOverdue ?? counts.OVERDUE,
      dueSoon: actionsDueSoon ?? counts["DUE SOON"],
      paid: counts.PAID,
      pending: counts.PENDING,
    };
  }, [rows, actionsOverdue, actionsDueSoon]);

  const chaseOverdue = actionsOverdue ?? stats.unitsOverdue;

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (occupancyFilter === "occupied" && rowIsVacant(row)) return false;
      if (occupancyFilter === "vacant" && !rowIsVacant(row)) return false;
      if (paymentFilter === "all") return true;
      if (!rowHasPaymentStatus(row)) return false;
      return row.status === paymentFilter;
    });
  }, [rows, occupancyFilter, paymentFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / LIST_PAGE_SIZE));
  const safeListPage = Math.min(Math.max(listPage, 1), pageCount);
  const pagedRows = useMemo(() => {
    const start = (safeListPage - 1) * LIST_PAGE_SIZE;
    return visibleRows.slice(start, start + LIST_PAGE_SIZE);
  }, [visibleRows, safeListPage]);

  useEffect(() => {
    if (!highlightUnitId && !highlightPropertyId) return;
    const index = visibleRows.findIndex((row) => {
      if (highlightUnitId && row.unitId === highlightUnitId) return true;
      if (
        highlightPropertyId &&
        row.needsUnit &&
        row.propertyId === highlightPropertyId
      ) {
        return true;
      }
      return false;
    });
    if (index < 0) return;
    const nextPage = Math.floor(index / LIST_PAGE_SIZE) + 1;
    const id = window.setTimeout(() => setListPage(nextPage), 0);
    return () => window.clearTimeout(id);
  }, [highlightUnitId, highlightPropertyId, visibleRows]);

  function emptyFilterCopy(): ReactNode {
    if (paymentFilter === "OVERDUE" && chaseOverdue > 0) {
      return (
        <>
          No overdue units match this filter (table may be paginated).{" "}
          <Link href="/reminders?filter=overdue" className="table-link">
            Open Action needed
          </Link>
          .
        </>
      );
    }
    if (paymentFilter === "DUE SOON" && (actionsDueSoon ?? 0) > 0) {
      return (
        <>
          No due-soon units match this filter (table may be paginated).{" "}
          <Link href="/reminders" className="table-link">
            Open Action needed
          </Link>
          .
        </>
      );
    }
    if (paymentFilter !== "all") {
      const label =
        paymentFilter === "DUE SOON"
          ? "due soon"
          : paymentFilter.toLowerCase();
      return `No ${label} units in this list. Switch payment status or occupancy.`;
    }
    if (occupancyFilter === "occupied") {
      return "No occupied units in this list. Switch to Vacant or All.";
    }
    if (occupancyFilter === "vacant") {
      return "No vacant units in this list. Switch to Occupied or All.";
    }
    return "No units to show.";
  }

  useEffect(() => {
    if ((!highlightUnitId && !highlightPropertyId) || !highlightRef.current) {
      return;
    }
    highlightRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightUnitId, highlightPropertyId, pagedRows.length]);

  // List rhythm: title + subtitle → optional stats → checklist and/or table.
  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">
            Units, rent, and payment status across your portfolio.
          </p>
        </div>
        {showHeaderActions ? (
          <div className="dashboard-header-actions">
            {chaseOverdue > 0 ? (
              <Link href="/reminders?filter=overdue" className="btn-secondary">
                {chaseOverdue} overdue → Chase
              </Link>
            ) : null}
            <Link href={addUnitHref} className="btn-secondary">
              Add unit
            </Link>
            <Link href="/properties/new" className="btn-primary">
              Add property
            </Link>
          </div>
        ) : (
          <div className="dashboard-header-actions">
            <Link href="/onboarding" className="btn-primary">
              Add property
            </Link>
          </div>
        )}
      </header>

      {(actionsFailed ?? 0) > 0 ? (
        <p className="page-subtitle" role="status">
          {actionsFailed === 1
            ? "1 chase send failed."
            : `${actionsFailed} chase sends failed.`}{" "}
          <Link href="/reminders?filter=failed" className="table-link">
            Retry on Action needed
          </Link>
        </p>
      ) : null}

      <div className="stat-row">
        <div className="stat-block">
          <p className="stat-label">Total Collected</p>
          <p className="stat-value mono-data">
            {formatNaira(stats.totalCollected)}
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Outstanding</p>
          <p className="stat-value mono-data">
            {formatNaira(stats.outstanding)}
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Units Overdue</p>
          <p className="stat-value mono-data">{chaseOverdue}</p>
          {chaseOverdue > 0 ? (
            <p className="table-muted" style={{ marginTop: 4 }}>
              <Link href="/reminders?filter=overdue" className="table-link">
                Chase on Action needed
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      {showChecklist ? (
        <GettingStartedChecklist items={checklistItems} />
      ) : null}

      {showTable ? (
        <>
          <div className="portfolio-filter-stack">
            <div className="portfolio-occupancy-bar">
              <p className="form-label" id="portfolio-occupancy-label">
                Occupancy
              </p>
              <div
                className="theme-segment"
                role="group"
                aria-labelledby="portfolio-occupancy-label"
              >
                {(
                  [
                    ["all", "All", occupancyCounts.all],
                    ["occupied", "Occupied", occupancyCounts.occupied],
                    ["vacant", "Vacant", occupancyCounts.vacant],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    className="theme-segment-btn"
                    data-active={occupancyFilter === id ? "true" : "false"}
                    aria-pressed={occupancyFilter === id}
                    onClick={() => {
                      setOccupancyFilter(id);
                      setListPage(1);
                    }}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
            </div>

            <div className="portfolio-occupancy-bar">
              <p className="form-label" id="portfolio-payment-label">
                Payment
              </p>
              <div
                className="theme-segment"
                role="group"
                aria-labelledby="portfolio-payment-label"
              >
                {(
                  [
                    ["all", "All", paymentCounts.all],
                    ["OVERDUE", "Overdue", paymentCounts.overdue],
                    ["DUE SOON", "Due soon", paymentCounts.dueSoon],
                    ["PAID", "Paid", paymentCounts.paid],
                    ["PENDING", "Pending", paymentCounts.pending],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    className="theme-segment-btn"
                    data-active={paymentFilter === id ? "true" : "false"}
                    aria-pressed={paymentFilter === id}
                    onClick={() => {
                      setPaymentFilter(id);
                      setListPage(1);
                    }}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="data-table-wrap data-table-wrap--stack">
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
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      {emptyFilterCopy()}
                    </td>
                  </tr>
                ) : null}
                {pagedRows.map((row) => {
                  const rowKey = row.needsUnit
                    ? `property-${row.propertyId}-empty`
                    : (row.unitId ?? row.propertyId ?? row.unit);
                  const highlightedUnit =
                    Boolean(row.unitId) && highlightUnitId === row.unitId;
                  const highlightedProperty =
                    Boolean(row.needsUnit) &&
                    Boolean(row.propertyId) &&
                    highlightPropertyId === row.propertyId;
                  const highlighted = highlightedUnit || highlightedProperty;

                  if (row.needsUnit && row.propertyId) {
                    return (
                      <tr
                        key={rowKey}
                        ref={highlighted ? highlightRef : undefined}
                        className={
                          highlighted
                            ? "table-row-needs-unit table-row-highlight"
                            : "table-row-needs-unit"
                        }
                        data-needs-unit="true"
                        data-highlighted={highlighted ? "true" : undefined}
                      >
                        <td data-label="Unit">
                          <Link
                            href={`/properties/${row.propertyId}`}
                            className="table-link"
                          >
                            {row.unit}
                          </Link>
                          <p className="table-muted table-empty-hint">
                            No units yet. Add a unit to track rent and reminders.
                          </p>
                        </td>
                        <td data-label="Tenant" className="table-muted">
                          -
                        </td>
                        <td data-label="Rent" className="mono-data table-muted">
                          -
                        </td>
                        <td data-label="Due date" className="mono-data table-muted">
                          -
                        </td>
                        <td data-label="Status">
                          <span className="status-badge pending">NO UNIT</span>
                        </td>
                        <td data-label="Actions">
                          <div className="table-actions">
                            <Link
                              href={`/properties/${row.propertyId}/units/new`}
                              className="btn-secondary btn-table-cta"
                            >
                              Add unit
                            </Link>
                            <Link
                              href={`/properties/${row.propertyId}/edit`}
                              className="table-link"
                            >
                              Edit property
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={rowKey}
                      ref={highlightedUnit ? highlightRef : undefined}
                      className={
                        highlightedUnit ? "table-row-highlight" : undefined
                      }
                      data-highlighted={highlightedUnit ? "true" : undefined}
                    >
                      <td data-label="Unit">
                        {row.unitId ? (
                          <Link
                            href={`/payments/${row.unitId}`}
                            className="table-link"
                          >
                            {row.unit}
                          </Link>
                        ) : row.propertyId ? (
                          <Link
                            href={`/properties/${row.propertyId}`}
                            className="table-link"
                          >
                            {row.unit}
                          </Link>
                        ) : (
                          row.unit
                        )}
                      </td>
                      <td data-label="Tenant">{row.tenant}</td>
                      <td data-label="Rent" className="mono-data">
                        {formatNaira(row.rent)}
                        {row.serviceCharge && row.serviceCharge > 0 ? (
                          <p className="table-muted mono-data" style={{ margin: "2px 0 0" }}>
                            + {formatNaira(row.serviceCharge)} SC
                          </p>
                        ) : null}
                      </td>
                      <td data-label="Due date" className="mono-data">
                        {formatDueDate(row.dueDate)}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={row.status} />
                      </td>
                      <td data-label="Actions">
                        <div className="table-actions">
                          {row.unitId &&
                          row.propertyId &&
                          rowIsVacant(row) ? (
                            <Link
                              href={`/properties/${row.propertyId}/units/${row.unitId}/tenancy`}
                              className="btn-secondary btn-table-cta"
                            >
                              Start tenancy
                            </Link>
                          ) : null}
                          {row.unitId &&
                          !rowIsVacant(row) &&
                          (row.status === "OVERDUE" ||
                            row.status === "DUE SOON") ? (
                            <>
                              <Link
                                href={`/payments/${row.unitId}`}
                                className="btn-secondary btn-table-cta"
                              >
                                Record payment
                              </Link>
                              <Link
                                href={`/reminders/${row.unitId}`}
                                className="table-link"
                              >
                                Remind
                              </Link>
                            </>
                          ) : null}
                          {row.unitId ? (
                            <Link
                              href={`/properties/units/${row.unitId}/edit`}
                              className="table-link"
                            >
                              Edit unit
                            </Link>
                          ) : null}
                          {row.propertyId ? (
                            <Link
                              href={`/properties/${row.propertyId}/edit`}
                              className="table-link"
                            >
                              Edit property
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

          <ListPagination
            page={safeListPage}
            pageCount={pageCount}
            total={visibleRows.length}
            pageSize={LIST_PAGE_SIZE}
            onPageChange={setListPage}
          />

          {hasMore && onLoadMore ? (
            <LoadMoreButton
              hasMore={hasMore}
              loading={loadingMore}
              onLoadMore={onLoadMore}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
