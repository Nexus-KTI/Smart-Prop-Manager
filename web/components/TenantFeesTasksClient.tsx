"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { TenantLeaseGate } from "@/components/TenantLeaseGate";
import { useToast } from "@/components/ToastProvider";
import {
  fetchMyFees,
  fetchMyTasks,
  fetchMyCalendar,
  updateTaskStatus,
  type CalendarEvent,
  type OpsTask,
  type ScheduledFee,
} from "@/lib/api";
import {
  CALENDAR_KIND_LABELS,
  FEE_STATUS_LABELS,
  TASK_STATUS_LABELS,
  labelOrTitle,
} from "@/lib/labels";

export function TenantFeesClient() {
  const [items, setItems] = useState<ScheduledFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchMyFees();
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TenantLeaseGate title="Fees" subtitle="Non-rent charges your landlord scheduled.">
      {() => (
        <>
          {loading ? <p className="page-subtitle">Loading…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          <ul className="stack-list">
            {items.map((f) => (
              <li key={f.id} className="form-card">
                <p>
                  <strong>{f.label}</strong>{" "}
                  <span className="table-muted">
                    · {f.currency} {Number(f.amount).toLocaleString()} · due {f.due_on} ·{" "}
                    {labelOrTitle(FEE_STATUS_LABELS, f.status)}
                  </span>
                </p>
                <p className="page-subtitle">
                  Pay via your landlord’s preferred channel or Home rent pay when they
                  record it against the unit.
                </p>
              </li>
            ))}
          </ul>
          {!loading && items.length === 0 ? (
            <p className="table-muted">No scheduled fees yet.</p>
          ) : null}
        </>
      )}
    </TenantLeaseGate>
  );
}

export function TenantTasksClient() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, c] = await Promise.all([fetchMyTasks(), fetchMyCalendar()]);
      setTasks(t);
      setEvents(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <TenantLeaseGate
      title="Tasks"
      subtitle="Items your landlord assigned, plus upcoming dates."
    >
      {() => (
        <>
          {loading ? <p className="page-subtitle">Loading…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
            Calendar
          </h2>
          <ul className="stack-list">
            {events.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="form-card">
                <span className="table-muted">{e.date}</span> ·{" "}
                {labelOrTitle(CALENDAR_KIND_LABELS, e.kind)}: {e.title}
              </li>
            ))}
          </ul>
          {!loading && events.length === 0 ? (
            <p className="table-muted">Nothing upcoming.</p>
          ) : null}
          <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
            Your tasks
          </h2>
          <ul className="stack-list">
            {tasks.map((t) => (
              <li key={t.id} className="form-card">
                <p>
                  <strong>{t.title}</strong>{" "}
                  <span className="table-muted">
                    · {labelOrTitle(TASK_STATUS_LABELS, t.status)}
                    {t.due_on ? ` · due ${t.due_on}` : ""}
                  </span>
                </p>
                {t.status === "open" ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      void updateTaskStatus(t.id, "done")
                        .then(load)
                        .catch((err) =>
                          showToast(err instanceof Error ? err.message : "Update failed"),
                        )
                    }
                  >
                    Mark done
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {!loading && tasks.length === 0 ? (
            <p className="table-muted">No landlord tasks yet.</p>
          ) : null}
        </>
      )}
    </TenantLeaseGate>
  );
}

void (0 as unknown as FormEvent);
