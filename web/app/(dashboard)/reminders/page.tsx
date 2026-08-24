"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { TableSkeleton } from "@/components/TableSkeleton";
import { useToast } from "@/components/ToastProvider";
import { resolveUnitStatus } from "@/lib/dashboard";
import { fetchPortfolioUnitsPage, sendBulkReminders } from "@/lib/api";
import type { PortfolioUnit, UnitStatus } from "@/lib/types";

type UnitRow = {
  id: string;
  label: string;
  tenant: string;
  contact: string;
  status: UnitStatus;
};

function portfolioToRows(items: PortfolioUnit[]): UnitRow[] {
  return items.map((item) => ({
    id: item.unit.id,
    label: `${item.property_name} · ${item.unit.label}`,
    tenant: item.unit.tenant_name?.trim() || "-",
    contact: item.unit.tenant_contact?.trim() || "-",
    status: resolveUnitStatus(item.unit, item.unit.transactions ?? []),
  }));
}

function overdueSelection(rows: UnitRow[]): Record<string, boolean> {
  return Object.fromEntries(
    rows
      .filter((row) => row.status === "OVERDUE" && row.contact !== "-")
      .map((row) => [row.id, true]),
  );
}

export default function RemindersPage() {
  const { showToast } = useToast();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const page = await fetchPortfolioUnitsPage(null);
        if (!active) return;
        const rows = portfolioToRows(page.items);
        setUnits(rows);
        setSelected(overdueSelection(rows));
        setNextCursor(page.next_cursor);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load reminders",
          );
          setUnits([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected],
  );

  const overdueCount = units.filter((u) => u.status === "OVERDUE").length;

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPortfolioUnitsPage(nextCursor);
      setUnits((current) => {
        const newRows = portfolioToRows(page.items);
        const existing = new Set(current.map((row) => row.id));
        const appended = newRows.filter((row) => !existing.has(row.id));
        const combined = [...current, ...appended];
        setSelected((prev) => ({ ...prev, ...overdueSelection(combined) }));
        return combined;
      });
      setNextCursor(page.next_cursor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more reminders",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function onBulkRemind() {
    if (selectedIds.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const result = await sendBulkReminders({ unit_ids: selectedIds });
      const channel = result.channel ? ` via ${result.channel}` : "";
      const firstError = result.errors?.[0]?.detail;
      showToast(
        firstError
          ? `Reminders: ${result.sent} sent, ${result.failed} failed${channel}. ${firstError}`
          : `Reminders: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped${channel}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reminders");
    } finally {
      setPending(false);
    }
  }

  if (!loading && error && units.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load reminders"
        message={error}
        onRetry={retry}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Reminders</h1>
          <p className="page-subtitle">
            {overdueCount > 0
              ? `${overdueCount} overdue unit${overdueCount === 1 ? "" : "s"} pre-selected. Open a unit for the full log.`
              : "Chase overdue rent, or open a unit for the full log."}
          </p>
        </div>
        {!loading && units.length > 0 ? (
          <div className="dashboard-header-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void onBulkRemind()}
              disabled={pending || selectedIds.length === 0}
            >
              {pending
                ? "Sending…"
                : `Remind selected (${selectedIds.length})`}
            </button>
          </div>
        ) : null}
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Select</span>
                </th>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <TableSkeleton columns={5} rows={6} />
            </tbody>
          </table>
        </div>
      ) : units.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No units yet.</p>
          <p className="dashboard-empty-copy">
            Add a property and unit first.
          </p>
          <Link href="/properties/new" className="btn-primary">
            Add a property
          </Link>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <span className="sr-only">Select</span>
                </th>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[unit.id])}
                      disabled={unit.contact === "-"}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [unit.id]: event.target.checked,
                        }))
                      }
                      aria-label={`Select ${unit.label}`}
                    />
                  </td>
                  <td>
                    <Link href={`/reminders/${unit.id}`} className="table-link">
                      {unit.label}
                    </Link>
                  </td>
                  <td>{unit.tenant}</td>
                  <td className="mono-data">{unit.contact}</td>
                  <td>
                    <span
                      className={`status-badge ${
                        unit.status === "PAID"
                          ? "paid"
                          : unit.status === "OVERDUE"
                            ? "overdue"
                            : unit.status === "DUE SOON"
                              ? "due-soon"
                              : "pending"
                      }`}
                    >
                      {unit.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && units.length > 0 ? (
        <LoadMoreButton
          hasMore={Boolean(nextCursor)}
          loading={loadingMore}
          onLoadMore={() => void onLoadMore()}
        />
      ) : null}
    </section>
  );
}
