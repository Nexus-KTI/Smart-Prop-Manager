"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { fetchUrgentActionsSummary, type PortfolioSummary } from "@/lib/api";
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

type PropertyGroup = {
  key: string;
  propertyId: string | null;
  name: string;
  /** Property with zero units (one placeholder row from the portfolio). */
  needsUnit: boolean;
  rows: DashboardRow[];
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

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
  /** Exact portfolio counts; null falls back to loaded rows. */
  summary?: PortfolioSummary | null;
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
  summary = null,
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
  const { items: checklistItems, unitCount } = buildGettingStarted(normalized);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const gettingStartedComplete = checklistItems.every((item) => item.done);
  // Checklist may guide next steps after Skip, but must never replace the table
  // when any property row exists (including zero-unit / needsUnit rows).
  const showChecklist = !gettingStartedComplete;
  const showTable = rows.length > 0;
  const propertyTotal = summary?.property_count ?? normalized.length;
  const unitTotal = summary?.unit_count ?? unitCount;
  const hasProperties = propertyTotal > 0 || normalized.length > 0;

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

  /** Units only — zero-unit property rows are not vacant units. */
  const occupancyCounts = useMemo(() => {
    if (summary) {
      return {
        all: summary.unit_count,
        occupied: summary.occupied,
        vacant: summary.vacant,
      };
    }
    let occupied = 0;
    let vacant = 0;
    for (const row of rows) {
      if (row.needsUnit) continue;
      if (rowIsVacant(row)) vacant += 1;
      else occupied += 1;
    }
    return { all: occupied + vacant, occupied, vacant };
  }, [rows, summary]);

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

  /** Whole-portfolio counts per property, independent of filters/page. */
  const propertySummaries = useMemo(() => {
    const map = new Map<string, { units: number; vacant: number }>();
    if (summary) {
      for (const entry of summary.properties) {
        map.set(entry.property_id, { units: entry.units, vacant: entry.vacant });
      }
      return map;
    }
    for (const row of rows) {
      if (!row.propertyId) continue;
      const entry = map.get(row.propertyId) ?? { units: 0, vacant: 0 };
      if (!row.needsUnit) {
        entry.units += 1;
        if (rowIsVacant(row)) entry.vacant += 1;
      }
      map.set(row.propertyId, entry);
    }
    return map;
  }, [rows, summary]);

  const pagedGroups = useMemo(() => {
    const groups: PropertyGroup[] = [];
    const byKey = new Map<string, PropertyGroup>();
    for (const row of pagedRows) {
      const key = row.propertyId ?? `row-${row.unit}`;
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          propertyId: row.propertyId ?? null,
          name:
            row.propertyName?.trim() ||
            (row.needsUnit ? row.unit : "Untitled property"),
          needsUnit: Boolean(row.needsUnit),
          rows: [],
        };
        byKey.set(key, group);
        groups.push(group);
      }
      if (!row.needsUnit) group.rows.push(row);
    }
    return groups;
  }, [pagedRows]);

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

  const failedSends = actionsFailed ?? 0;

  // Property-first rhythm: title + counts → Add property → alert →
  // compact money snapshot → filters → properties with their units.
  return (
    <section className="dashboard properties-page">
      <header className="properties-head">
        <div className="properties-head-text">
          <h1 className="page-title">Properties</h1>
          <p className="properties-count">
            {hasProperties
              ? `${plural(propertyTotal, "property", "properties")} · ${plural(unitTotal, "unit", "units")}`
              : "Add a property to start tracking rent."}
          </p>
        </div>
        <Link
          href={hasProperties ? "/properties/new" : "/onboarding"}
          className="btn-primary properties-add"
        >
          Add property
        </Link>
      </header>

      {chaseOverdue > 0 || failedSends > 0 ? (
        <div className="properties-alert" role="status">
          {chaseOverdue > 0 ? (
            <p className="properties-alert-line">
              <span className="properties-alert-text">
                {plural(chaseOverdue, "unit", "units")} overdue
              </span>
              <Link href="/reminders?filter=overdue" className="table-link">
                Chase on Action needed
              </Link>
            </p>
          ) : null}
          {failedSends > 0 ? (
            <p className="properties-alert-line">
              <span className="properties-alert-text">
                {plural(failedSends, "chase send", "chase sends")} failed
              </span>
              <Link href="/reminders?filter=failed" className="table-link">
                Retry on Action needed
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="properties-snapshot">
        <div className="properties-snapshot-item">
          <dt className="stat-label">Collected</dt>
          <dd className="properties-snapshot-value mono-data">
            {formatNaira(stats.totalCollected)}
          </dd>
        </div>
        <div className="properties-snapshot-item">
          <dt className="stat-label">Outstanding</dt>
          <dd className="properties-snapshot-value mono-data">
            {formatNaira(stats.outstanding)}
          </dd>
        </div>
        <div className="properties-snapshot-item">
          <dt className="stat-label">Overdue</dt>
          <dd
            className="properties-snapshot-value mono-data"
            data-tone={chaseOverdue > 0 ? "alert" : undefined}
          >
            {chaseOverdue}
          </dd>
        </div>
      </dl>

      {showChecklist && !showTable ? (
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

            <div className="portfolio-occupancy-bar portfolio-occupancy-bar--secondary">
              <p className="form-label" id="portfolio-payment-label">
                Payment
              </p>
              <div
                className="theme-segment theme-segment--quiet"
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
              {pagedRows.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={6} className="table-empty">
                      {emptyFilterCopy()}
                    </td>
                  </tr>
                </tbody>
              ) : null}
              {pagedGroups.map((group) => {
                const summary = group.propertyId
                  ? propertySummaries.get(group.propertyId)
                  : undefined;
                const highlightedProperty =
                  group.needsUnit &&
                  Boolean(group.propertyId) &&
                  highlightPropertyId === group.propertyId;
                const meta = group.needsUnit
                  ? "No units yet"
                  : summary
                    ? summary.vacant > 0
                      ? `${plural(summary.units, "unit", "units")} · ${summary.vacant} vacant`
                      : plural(summary.units, "unit", "units")
                    : null;

                return (
                  <tbody
                    key={group.key}
                    className="property-group"
                    data-needs-unit={group.needsUnit ? "true" : undefined}
                  >
                    <tr
                      ref={highlightedProperty ? highlightRef : undefined}
                      className={
                        highlightedProperty
                          ? "property-group-head table-row-highlight"
                          : "property-group-head"
                      }
                      data-highlighted={highlightedProperty ? "true" : undefined}
                    >
                      <th colSpan={6} scope="rowgroup">
                        <div className="property-group-bar">
                          <div className="property-group-title">
                            {group.propertyId ? (
                              <Link
                                href={`/properties/${group.propertyId}`}
                                className="property-group-name"
                              >
                                {group.name}
                              </Link>
                            ) : (
                              <span className="property-group-name">
                                {group.name}
                              </span>
                            )}
                            {meta ? (
                              <span className="property-group-meta">{meta}</span>
                            ) : null}
                          </div>
                          {group.propertyId ? (
                            <div className="table-actions property-group-actions">
                              <Link
                                href={`/properties/${group.propertyId}/units/new`}
                                className={
                                  group.needsUnit
                                    ? "btn-secondary btn-table-cta property-group-add"
                                    : "table-link property-group-add"
                                }
                              >
                                Add unit
                              </Link>
                              <Link
                                href={`/properties/${group.propertyId}/edit`}
                                className="table-link table-link--quiet"
                              >
                                Edit property
                              </Link>
                            </div>
                          ) : null}
                        </div>
                        {group.needsUnit ? (
                          <p className="table-muted property-group-hint">
                            Add a unit to track rent and reminders.
                          </p>
                        ) : null}
                      </th>
                    </tr>
                    {group.rows.map((row) => {
                  const rowKey = row.unitId ?? row.propertyId ?? row.unit;
                  const highlightedUnit =
                    Boolean(row.unitId) && highlightUnitId === row.unitId;
                  const unitName = row.unitLabel ?? row.unit;

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
                            {unitName}
                          </Link>
                        ) : (
                          unitName
                        )}
                      </td>
                      <td data-label="Tenant">
                        {rowIsVacant(row) ? (
                          <span className="table-muted">Vacant</span>
                        ) : (
                          row.tenant
                        )}
                      </td>
                      <td data-label="Rent" className="mono-data">
                        {formatNaira(row.rent)}
                        {row.serviceCharge && row.serviceCharge > 0 ? (
                          <span className="table-muted mono-data unit-service-charge">
                            + {formatNaira(row.serviceCharge)} SC
                          </span>
                        ) : null}
                      </td>
                      <td
                        data-label="Due date"
                        className="mono-data"
                        data-empty={row.dueDate ? undefined : "true"}
                      >
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
                              className="table-link table-link--quiet"
                            >
                              Edit unit
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                    })}
                  </tbody>
                );
              })}
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

          {showChecklist ? (
            <GettingStartedChecklist items={checklistItems} />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
