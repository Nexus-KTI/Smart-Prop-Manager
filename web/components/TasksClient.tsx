"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  createTask,
  fetchCalendar,
  fetchTasks,
  updateTaskStatus,
  type CalendarEvent,
  type OpsTask,
} from "@/lib/api";
import {
  CALENDAR_KIND_LABELS,
  TASK_AUDIENCE_LABELS,
  TASK_STATUS_LABELS,
  labelOrTitle,
} from "@/lib/labels";

export function TasksClient() {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, c] = await Promise.all([fetchTasks(), fetchCalendar()]);
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await createTask({
        title: String(data.get("title") || "").trim(),
        details: String(data.get("details") || "") || undefined,
        due_on: String(data.get("due_on") || "") || undefined,
        audience: String(data.get("audience") || "landlord"),
        tenancy_id: String(data.get("tenancy_id") || "") || undefined,
      });
      showToast("Task created");
      event.currentTarget.reset();
      setOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Tasks & calendar</h1>
          <p className="page-subtitle">
            Your to-dos plus upcoming lease ends and fees (60 days).
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "New task"}
        </button>
      </header>
      {open ? (
        <form className="form-card" onSubmit={onSubmit}>
          <label className="form-label">
            Title
            <input name="title" required className="form-input" />
          </label>
          <label className="form-label">
            Details
            <input name="details" className="form-input" />
          </label>
          <label className="form-label">
            Due
            <input name="due_on" type="date" className="form-input" />
          </label>
          <label className="form-label">
            Audience
            <select name="audience" className="form-input" defaultValue="landlord">
              <option value="landlord">Landlord</option>
              <option value="tenant">Tenant (needs tenancy id)</option>
            </select>
          </label>
          <label className="form-label">
            Tenancy id (for tenant tasks)
            <input name="tenancy_id" className="form-input" placeholder="optional uuid" />
          </label>
          <button type="submit" className="btn-primary">
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
        All tasks
      </h2>
      <ul className="stack-list">
        {tasks.map((t) => (
          <li key={t.id} className="form-card">
            <p>
              <strong>{t.title}</strong>{" "}
              <span className="table-muted">
                · {labelOrTitle(TASK_STATUS_LABELS, t.status)} ·{" "}
                {labelOrTitle(TASK_AUDIENCE_LABELS, t.audience)}
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
    </section>
  );
}
