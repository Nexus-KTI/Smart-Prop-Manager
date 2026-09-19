"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  createTask,
  fetchCalendar,
  fetchPortfolioTenancies,
  fetchTasks,
  updateTaskStatus,
  type CalendarEvent,
  type OpsTask,
  type PortfolioTenancy,
} from "@/lib/api";
import {
  CALENDAR_KIND_LABELS,
  TASK_AUDIENCE_LABELS,
  TASK_STATUS_LABELS,
  labelOrTitle,
} from "@/lib/labels";

function tenancyOptionLabel(t: PortfolioTenancy): string {
  const bits = [
    t.property_name,
    t.unit_label,
    t.tenant_name || t.tenant_contact,
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(" · ") : "Tenancy";
}

function isAssignableTenancy(t: PortfolioTenancy): boolean {
  return Boolean(t.tenant_user_id);
}

export function TasksClient() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tenancies, setTenancies] = useState<PortfolioTenancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<"landlord" | "tenant">("landlord");
  const [tenancyId, setTenancyId] = useState("");
  const [tasksCapped, setTasksCapped] = useState(false);
  const [tasksLoaded, setTasksLoaded] = useState(0);
  const [calendarCapped, setCalendarCapped] = useState(false);

  const assignable = useMemo(
    () => tenancies.filter(isAssignableTenancy),
    [tenancies],
  );

  const tenancyLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tenancies) {
      map.set(t.id, tenancyOptionLabel(t));
    }
    return map;
  }, [tenancies]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, c, leases] = await Promise.all([
        fetchTasks(),
        fetchCalendar(),
        fetchPortfolioTenancies()
          .then((data) => data.items)
          .catch(() => [] as PortfolioTenancy[]),
      ]);
      setTasks(t.items);
      setTasksCapped(t.capped);
      setTasksLoaded(t.loaded);
      setEvents(c.items);
      setCalendarCapped(c.capped);
      setTenancies(leases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (audience !== "tenant") {
      setTenancyId("");
      return;
    }
    if (!tenancyId && assignable[0]?.id) {
      setTenancyId(assignable[0].id);
    }
  }, [audience, assignable, tenancyId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (audience === "tenant" && !tenancyId) {
      showToast("Pick a tenant", "error");
      return;
    }
    try {
      const created = await createTask({
        title: String(data.get("title") || "").trim(),
        details: String(data.get("details") || "") || undefined,
        due_on: String(data.get("due_on") || "") || undefined,
        audience,
        tenancy_id: audience === "tenant" ? tenancyId : undefined,
      });
      if (audience === "tenant" && created?.notify?.sent) {
        showToast("To-do created — tenant notified", "success");
      } else if (audience === "tenant" && created?.notify?.error) {
        showToast("To-do created — could not notify tenant", "success");
      } else {
        showToast("To-do created", "success");
      }
      form.reset();
      setAudience("landlord");
      setTenancyId("");
      setOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed", "error");
    }
  }

  function taskAudienceLine(t: OpsTask): string {
    const base = labelOrTitle(TASK_AUDIENCE_LABELS, t.audience);
    if (t.audience !== "tenant") return base;
    const lease =
      (t.tenancy_id && tenancyLabelById.get(t.tenancy_id)) || null;
    return lease ? `Tenant · ${lease}` : base;
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">To-dos & calendar</h1>
          <p className="page-subtitle">
            Personal to-dos plus upcoming lease ends and fees (60 days) — not
            repair work orders.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "New to-do"}
        </button>
      </header>
      {tasksCapped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {tasksLoaded} most recent to-dos. Older items may not
          appear here.
        </p>
      ) : null}
      {calendarCapped && !loading ? (
        <p className="page-subtitle" role="status">
          Calendar feed is capped per source (tasks, lease ends, fees). Some
          upcoming dates may be missing.
        </p>
      ) : null}
      {open ? (
        <form className="form-card" onSubmit={onSubmit}>
          <label className="form-field">
            <span className="form-label">Title</span>
            <input name="title" required className="form-input" />
          </label>
          <label className="form-field">
            <span className="form-label">Details</span>
            <input name="details" className="form-input" />
          </label>
          <label className="form-field">
            <span className="form-label">Due</span>
            <input name="due_on" type="date" className="form-input" />
          </label>
          <label className="form-field">
            <span className="form-label">For</span>
            <select
              className="form-input"
              value={audience}
              onChange={(e) =>
                setAudience(e.target.value === "tenant" ? "tenant" : "landlord")
              }
            >
              <option value="landlord">Me</option>
              <option value="tenant">A tenant</option>
            </select>
          </label>
          {audience === "tenant" ? (
            <label className="form-field">
              <span className="form-label">Tenant</span>
              {assignable.length > 0 ? (
                <select
                  className="form-input"
                  value={tenancyId}
                  onChange={(e) => setTenancyId(e.target.value)}
                  required
                >
                  {assignable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {tenancyOptionLabel(t)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="table-muted">
                  No claimed tenancies yet. Activate a lease and invite a tenant
                  first.
                </p>
              )}
            </label>
          ) : null}
          <button
            type="submit"
            className="btn-primary"
            disabled={audience === "tenant" && assignable.length === 0}
          >
            Save
          </button>
        </form>
      ) : null}
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <h2 className="page-title" style={{ fontSize: "1.15rem" }}>
        Upcoming
      </h2>
      <ul className="stack-list">
        {events.map((e) => (
          <li key={`${e.kind}-${e.id}`} className="form-card">
            <p>
              <span className="table-muted">{e.date}</span> ·{" "}
              {labelOrTitle(CALENDAR_KIND_LABELS, e.kind)}: {e.title}
            </p>
          </li>
        ))}
      </ul>
      {!loading && events.length === 0 ? (
        <p className="table-muted">Nothing due in the next 60 days.</p>
      ) : null}

      <h2 className="page-title" style={{ fontSize: "1.15rem" }}>
        All to-dos
      </h2>
      {!loading && tasks.length === 0 && !open ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No to-dos yet.</p>
          <p className="dashboard-empty-copy">
            Add a personal reminder or assign one to a claimed tenant.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setOpen(true)}
          >
            New to-do
          </button>
        </div>
      ) : null}
      {tasks.length > 0 || open ? (
      <ul className="stack-list">
        {tasks.map((t) => (
          <li key={t.id} className="form-card">
            <p>
              <strong>{t.title}</strong>{" "}
              <span className="table-muted">
                · {labelOrTitle(TASK_STATUS_LABELS, t.status)} ·{" "}
                {taskAudienceLine(t)}
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
                      showToast(
                        err instanceof Error ? err.message : "Update failed",
                        "error",
                      ),
                    )
                }
              >
                Mark done
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      ) : null}
    </section>
  );
}
