"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  assignMaintenanceArtisan,
  createUnitWorkOrder,
  fetchArtisanRoster,
  fetchUnitMaintenanceRequests,
  updateMaintenanceRequestStatus,
  type ArtisanRosterItem,
  type MaintenanceRequest,
} from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import {
  MAINTENANCE_ORIGIN_LABELS,
  MAINTENANCE_STATUS_LABELS,
  PRIORITY_LABELS,
  labelOrTitle,
} from "@/lib/labels";

type Props = {
  unitId: string;
};

const NEXT_STATUSES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "canceled", label: "Canceled" },
] as const;

export function UnitMaintenanceRequestsCard({ unitId }: Props) {
  const { showToast } = useToast();
  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [roster, setRoster] = useState<ArtisanRosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [jobOpen, setJobOpen] = useState(false);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, artisans] = await Promise.all([
        fetchUnitMaintenanceRequests(unitId),
        fetchArtisanRoster(),
      ]);
      setItems(rows);
      setRoster(
        artisans.items.filter((a) => a.status === "active" && a.artisan_user_id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onStatusChange(id: string, next: string) {
    setUpdatingId(id);
    try {
      await updateMaintenanceRequestStatus(id, next);
      showToast(
        `Request marked ${labelOrTitle(MAINTENANCE_STATUS_LABELS, next).toLowerCase()}`,
      );
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function onCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    try {
      await createUnitWorkOrder(unitId, {
        title: String(data.get("title") || "").trim(),
        details: String(data.get("details") || "").trim() || undefined,
        priority: String(data.get("priority") || "normal"),
      });
      showToast("Work order created", "success");
      form.reset();
      setJobOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Create failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const artisanId = String(data.get("artisan_user_id") || "");
    const endLocal = String(data.get("scheduled_end") || "");
    const startLocal = String(data.get("scheduled_start") || "");
    setSubmitting(true);
    try {
      const result = await assignMaintenanceArtisan(assignId, {
        artisan_user_id: artisanId,
        scheduled_start: startLocal ? new Date(startLocal).toISOString() : undefined,
        scheduled_end: endLocal ? new Date(endLocal).toISOString() : undefined,
        issue_access_pass: data.get("issue_access_pass") === "on" && Boolean(endLocal),
      });
      if (result.notify?.sent) {
        showToast("Artisan assigned — notified", "success");
      } else if (result.notify?.error) {
        showToast("Artisan assigned — could not notify", "success");
      } else {
        showToast("Artisan assigned", "success");
      }
      setAssignId(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Assign failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const openCount = items.filter(
    (row) => row.status === "new" || row.status === "in_progress",
  ).length;

  return (
    <section className="form-card" style={{ marginTop: 20 }} aria-label="Repair requests">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">Tenant requests</p>
          <h2 className="page-title" style={{ fontSize: "1.15rem", margin: 0 }}>
            Repair requests
          </h2>
          <p className="page-subtitle" style={{ margin: "4px 0 0" }}>
            {openCount > 0
              ? `${openCount} open. Triage or assign an artisan`
              : "Tenant requests + landlord work orders"}
          </p>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setJobOpen((o) => !o)}
          >
            {jobOpen ? "Close" : "New job"}
          </button>
        </div>
      </header>

      {jobOpen ? (
        <form className="settings-inline-form" onSubmit={(e) => void onCreateJob(e)} style={{ marginBottom: 16 }}>
          <label className="form-field">
            <span className="form-label">Title</span>
            <input className="form-input" name="title" required disabled={submitting} />
          </label>
          <label className="form-field">
            <span className="form-label">Details</span>
            <textarea className="form-input" name="details" rows={2} disabled={submitting} />
          </label>
          <label className="form-field">
            <span className="form-label">Priority</span>
            <select className="form-input" name="priority" defaultValue="normal" disabled={submitting}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>
            Create work order
          </button>
        </form>
      ) : null}

      {assignId ? (
        <form className="settings-inline-form" onSubmit={(e) => void onAssign(e)} style={{ marginBottom: 16 }}>
          <p className="form-kicker">Assign artisan</p>
          {roster.length === 0 ? (
            <p className="form-error">
              Invite an artisan from Work orders first, then have them claim the link.
            </p>
          ) : (
            <>
              <label className="form-field">
                <span className="form-label">Artisan</span>
                <select className="form-input" name="artisan_user_id" required disabled={submitting}>
                  {roster.map((a) => (
                    <option key={a.id} value={a.artisan_user_id || ""}>
                      {a.invite_contact || a.artisan_user_id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">Window start</span>
                <input
                  className="form-input"
                  name="scheduled_start"
                  type="datetime-local"
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span className="form-label">Window end</span>
                <input
                  className="form-input"
                  name="scheduled_end"
                  type="datetime-local"
                  disabled={submitting}
                />
              </label>
              <label className="form-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="issue_access_pass" defaultChecked disabled={submitting} />
                <span className="form-label" style={{ margin: 0 }}>
                  Issue gate code for window (needs end time)
                </span>
              </label>
              <div className="dashboard-header-actions">
                <button type="submit" className="btn-primary" disabled={submitting}>
                  Assign
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAssignId(null)}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!loading && !error && items.length === 0 && !jobOpen ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No repair requests yet.</p>
          <p className="dashboard-empty-copy">
            Log a work order so you can assign an artisan.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setJobOpen(true)}
          >
            New job
          </button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>From</th>
                <th>Priority</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.title}</strong>
                    {row.details ? (
                      <p className="table-muted" style={{ margin: "4px 0 0" }}>
                        {row.details}
                      </p>
                    ) : null}
                    {row.artisan_user_id ? (
                      <p className="table-muted" style={{ margin: "4px 0 0" }}>
                        Assigned artisan
                      </p>
                    ) : null}
                    {row.photo_url ? (
                      <p style={{ margin: "6px 0 0" }}>
                        <a
                          href={row.photo_url}
                          className="mr-photo-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={row.photo_url}
                            alt={`Photo for ${row.title}`}
                            className="mr-photo-thumb"
                          />
                        </a>
                      </p>
                    ) : null}
                  </td>
                  <td>
                    {labelOrTitle(
                      MAINTENANCE_ORIGIN_LABELS,
                      row.origin || "tenant",
                    )}
                  </td>
                  <td>{labelOrTitle(PRIORITY_LABELS, row.priority)}</td>
                  <td>
                    <select
                      className="form-input"
                      value={row.status}
                      disabled={updatingId === row.id}
                      onChange={(e) => void onStatusChange(row.id, e.target.value)}
                      aria-label={`Status for ${row.title}`}
                    >
                      {NEXT_STATUSES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {row.status !== "resolved" && row.status !== "canceled" ? (
                      <button
                        type="button"
                        className="table-link"
                        onClick={() => setAssignId(row.id)}
                      >
                        Invite artisan
                      </button>
                    ) : row.status === "resolved" ? (
                      <a
                        href={`/payments/${unitId}?manual=1&charge=other`}
                        className="table-link"
                      >
                        Log other payment
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
