"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

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

  useEffect(() => {
    if ((!highlightUnitId && !highlightPropertyId) || !highlightRef.current) {
      return;
    }
    highlightRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightUnitId, highlightPropertyId, rows.length]);

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
          <p className="stat-value mono-data">{stats.unitsOverdue}</p>
        </div>
      </div>

      {showChecklist ? (
        <GettingStartedChecklist items={checklistItems} />
      ) : null}

      {showTable ? (
        <>
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
                {rows.map((row) => {
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
                        <td>
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
                        <td className="table-muted">-</td>
                        <td className="mono-data table-muted">-</td>
                        <td className="mono-data table-muted">-</td>
                        <td>
                          <span className="status-badge pending">NO UNIT</span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <Link
                              href={`/properties/${row.propertyId}/units/new`}
                              className="btn-primary btn-table-cta"
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
                      <td>
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
                      <td>{row.tenant}</td>
                      <td className="mono-data">
                        {formatNaira(row.rent)}
                        {row.serviceCharge && row.serviceCharge > 0 ? (
                          <p className="table-muted" style={{ margin: "2px 0 0" }}>
                            + {formatNaira(row.serviceCharge)} SC
                          </p>
                        ) : null}
                      </td>
                      <td className="mono-data">
                        {formatDueDate(row.dueDate)}
                      </td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        <div className="table-actions">
                          {row.unitId &&
                          (row.status === "OVERDUE" ||
                            row.status === "DUE SOON") ? (
                            <>
                              <Link
                                href={`/payments/${row.unitId}`}
                                className="btn-primary btn-table-cta"
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
