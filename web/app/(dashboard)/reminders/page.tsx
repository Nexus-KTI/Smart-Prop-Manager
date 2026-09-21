"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { useToast } from "@/components/ToastProvider";
import {
  fetchUrgentActions,
  retryReminder,
  sendBulkReminders,
  type UrgentActionItem,
  type UrgentActionsSummary,
} from "@/lib/api";

type ListFilter = "urgent" | "overdue" | "ending_soon" | "failed";

const FILTERS: ListFilter[] = ["urgent", "overdue", "ending_soon", "failed"];

function parseFilter(raw: string | null): ListFilter {
  if (raw && FILTERS.includes(raw as ListFilter)) return raw as ListFilter;
  return "urgent";
}

function isOverdueKind(kind: string): boolean {
  return kind === "overdue_chase" || kind === "overdue_no_contact";
}

function matchesFilter(item: UrgentActionItem, filter: ListFilter): boolean {
  if (filter === "urgent") return true;
  if (filter === "overdue") return isOverdueKind(item.kind);
  if (filter === "ending_soon") return item.kind === "lease_ending";
  return item.kind === "chase_failed";
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "overdue_chase":
    case "overdue_no_contact":
      return "OVERDUE";
    case "due_soon":
      return "DUE SOON";
    case "lease_ending":
      return "ENDING SOON";
    case "chase_failed":
      return "FAILED";
    default:
      return kind.replace(/_/g, " ").toUpperCase();
  }
}

function kindTone(kind: string): string {
  switch (kind) {
    case "overdue_chase":
    case "overdue_no_contact":
    case "chase_failed":
      return "overdue";
    case "due_soon":
      return "due-soon";
    case "lease_ending":
      return "pending";
    default:
      return "pending";
  }
}

function canBulkSelect(item: UrgentActionItem): boolean {
  return item.kind === "overdue_chase" && Boolean(item.tenant_contact?.trim());
}

function chaseSelection(items: UrgentActionItem[]): Record<string, boolean> {
  return Object.fromEntries(
    items.filter(canBulkSelect).map((item) => [item.unit_id, true]),
  );
}

function unitLine(item: UrgentActionItem): string {
  const prop = (item.property_name || "").trim();
  const label = (item.unit_label || "Unit").trim();
  return prop ? `${prop} · ${label}` : label;
}

export default function RemindersPage() {
  return (
    <Suspense
      fallback={
        <section className="dashboard">
          <header className="dashboard-header">
            <h1 className="page-title">Action needed</h1>
            <p className="page-subtitle">Loading…</p>
          </header>
        </section>
      }
    >
      <RemindersPageInner />
    </Suspense>
  );
}

function RemindersPageInner() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listFilter = parseFilter(searchParams.get("filter"));

  const [items, setItems] = useState<UrgentActionItem[]>([]);
  const [summary, setSummary] = useState<UrgentActionsSummary>({
    urgent: 0,
    overdue: 0,
    lease_ending: 0,
    failed: 0,
    due_soon: 0,
  });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  function setFilter(next: ListFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "urgent") params.delete("filter");
    else params.set("filter", next);
    const q = params.toString();
    router.replace(q ? `/reminders?${q}` : "/reminders", { scroll: false });
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchUrgentActions();
        if (!active) return;
        setItems(data.items);
        setSummary(data.summary);
        setSelected(chaseSelection(data.items));
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load action needed",
          );
          setItems([]);
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

  const visible = useMemo(
    () => items.filter((item) => matchesFilter(item, listFilter)),
    [items, listFilter],
  );

  const chaseableVisible = useMemo(
    () => visible.filter(canBulkSelect),
    [visible],
  );

  async function onBulkRemind() {
    if (selectedIds.length === 0) return;
    setPending(true);
    setError(null);
    try {
      const result = await sendBulkReminders({ unit_ids: selectedIds });
      const channel = result.channel ? ` via ${result.channel}` : "";
      const errBits = (result.errors ?? [])
        .slice(0, 2)
        .map((e) => (e.label ? `${e.label}: ${e.detail}` : e.detail))
        .filter(Boolean);
      const errSuffix = errBits.length ? `, ${errBits.join("; ")}` : "";
      showToast(
        `Reminders: ${result.sent} queued, ${result.failed} failed, ${result.skipped} skipped${channel}${errSuffix}.`,
        result.failed > 0 && result.sent === 0
          ? "error"
          : result.failed > 0
            ? "neutral"
            : "success",
      );
      const failedIds = new Set(
        [
          ...(result.failed_unit_ids ?? []),
          ...(result.errors ?? []).map((e) => e.unit_id),
        ].filter((id): id is string => Boolean(id)),
      );
      if (failedIds.size > 0) {
        setSelected(
          Object.fromEntries([...failedIds].map((id) => [id, true])),
        );
      } else if (result.failed === 0) {
        setSelected({});
      }
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reminders");
      showToast(
        err instanceof Error ? err.message : "Could not send reminders",
        "error",
      );
    } finally {
      setPending(false);
    }
  }

  async function onRetryFailed(item: UrgentActionItem) {
    if (!item.reminder_id || retryingId) return;
    setRetryingId(item.id);
    try {
      await retryReminder(item.reminder_id);
      showToast("Notice retry queued", "success");
      setReloadKey((k) => k + 1);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not retry notice.",
        "error",
      );
    } finally {
      setRetryingId(null);
    }
  }

  if (!loading && error && items.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load Action needed"
        message={error}
        onRetry={retry}
      />
    );
  }

  const subtitle =
    summary.overdue > 0
      ? `${summary.overdue} overdue unit${summary.overdue === 1 ? "" : "s"} ready to chase. Open a unit for the full log.`
      : "Chase rent, fix failed sends, renewals ending soon.";

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Action needed</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/ops" className="btn-secondary">
            Across owners
          </Link>
          {!loading && chaseableVisible.length > 0 ? (
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
          ) : null}
        </div>
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
                <th>Why</th>
                <th>Type</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <TableSkeleton columns={6} rows={6} />
            </tbody>
          </table>
        </div>
      ) : items.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">You’re caught up.</p>
          <p className="dashboard-empty-copy">
            No overdue chase, ending leases, or failed sends right now.
          </p>
          <Link href="/properties" className="btn-primary">
            Open properties
          </Link>
        </div>
      ) : (
        <>
          <div className="portfolio-occupancy-bar">
            <p className="form-label" id="reminders-status-label">
              Show
            </p>
            <div
              className="theme-segment"
              role="group"
              aria-labelledby="reminders-status-label"
            >
              {(
                [
                  ["urgent", "Urgent", summary.urgent],
                  ["overdue", "Overdue", summary.overdue],
                  ["ending_soon", "Ending soon", summary.lease_ending],
                  ["failed", "Failed", summary.failed],
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

          <div className="data-table-wrap data-table-wrap--stack">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">Select</span>
                  </th>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Why</th>
                  <th>Type</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Nothing in this filter. Switch to Urgent.
                    </td>
                  </tr>
                ) : null}
                {visible.map((item) => {
                  const selectable = canBulkSelect(item);
                  const line = unitLine(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[item.unit_id])}
                          disabled={!selectable}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [item.unit_id]: event.target.checked,
                            }))
                          }
                          aria-label={`Select ${line}`}
                        />
                      </td>
                      <td>
                        <Link
                          href={`/reminders/${item.unit_id}`}
                          className="table-link"
                        >
                          {line}
                        </Link>
                      </td>
                      <td>{item.tenant_name?.trim() || "-"}</td>
                      <td>{item.detail || "-"}</td>
                      <td>
                        <span
                          className={`status-badge ${kindTone(item.kind)}`}
                        >
                          {kindLabel(item.kind)}
                        </span>
                      </td>
                      <td>
                        {item.kind === "overdue_no_contact" ? (
                          <Link
                            href={`/properties/units/${item.unit_id}/edit`}
                            className="table-link"
                          >
                            Add contact
                          </Link>
                        ) : item.kind === "chase_failed" && item.reminder_id ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={retryingId === item.id}
                            onClick={() => void onRetryFailed(item)}
                          >
                            {retryingId === item.id ? "Retrying…" : "Retry"}
                          </button>
                        ) : item.kind === "lease_ending" ? (
                          <Link
                            href="/tenancies?filter=ending_soon"
                            className="table-link"
                          >
                            Tenancies
                          </Link>
                        ) : (
                          <Link
                            href={`/reminders/${item.unit_id}`}
                            className="table-link"
                          >
                            Log
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
