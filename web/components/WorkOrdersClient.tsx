"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  fetchArtisanRoster,
  fetchMaintenanceBoard,
  inviteArtisan,
  type ArtisanRosterItem,
  type MaintenanceRequest,
} from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import {
  ARTISAN_STATUS_LABELS,
  MAINTENANCE_STATUS_LABELS,
  labelOrTitle,
} from "@/lib/labels";

export function WorkOrdersClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [roster, setRoster] = useState<ArtisanRosterItem[]>([]);
  const [rosterCapped, setRosterCapped] = useState(false);
  const [rosterLoaded, setRosterLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastClaimPath, setLastClaimPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [board, artisans] = await Promise.all([
        fetchMaintenanceBoard(),
        fetchArtisanRoster(),
      ]);
      setItems(board.items);
      setOpenCount(board.open_count);
      setDoneCount(board.done_count);
      setCapped(board.capped);
      setLoaded(board.loaded);
      setRoster(artisans.items);
      setRosterCapped(artisans.capped);
      setRosterLoaded(artisans.loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const contact = String(new FormData(form).get("invite_contact") || "").trim();
    if (!contact) return;
    setSubmitting(true);
    try {
      const res = await inviteArtisan(contact);
      const path = res.claim_path;
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${path}`
          : path;
      setLastClaimPath(url);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        /* claim link still shown below */
      }
      if (res.notify?.sent) {
        showToast(
          copied
            ? "Invite created — notify sent. Claim link copied"
            : "Invite created — notify sent. Copy the claim link below",
          "success",
        );
      } else if (res.notify?.error) {
        showToast(
          copied
            ? "Invite created — could not notify. Claim link copied"
            : "Invite created — could not notify. Copy the claim link below",
          "success",
        );
      } else {
        showToast(
          copied
            ? "Invite created. Claim link copied"
            : "Invite created. Copy the claim link below",
          "success",
        );
      }
      form.reset();
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Invite failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const open = items.filter(
    (i) => i.status === "new" || i.status === "in_progress",
  );
  const done = items.filter(
    (i) => i.status === "resolved" || i.status === "canceled",
  );

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Work orders</h1>
          <p className="page-subtitle">
            Repair jobs across your portfolio. Assign artisans from unit Payments.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/access" className="btn-secondary">
            Gate codes
          </Link>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setInviteOpen((o) => !o)}
          >
            {inviteOpen ? "Close" : "Invite artisan"}
          </button>
        </div>
      </header>

      {inviteOpen ? (
        <form className="form-card" onSubmit={(e) => void onInvite(e)}>
          <label className="form-field">
            <span className="form-label">Phone or email</span>
            <input
              className="form-input"
              name="invite_contact"
              required
              placeholder="+234… or name@…"
              disabled={submitting}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create invite link"}
          </button>
          {lastClaimPath ? (
            <p className="form-success" style={{ marginTop: 12 }}>
              Claim link: <span className="mono-data">{lastClaimPath}</span>
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="form-card" style={{ marginTop: 16 }}>
        <h2 className="page-title" style={{ fontSize: "1.05rem" }}>
          Artisan roster
        </h2>
        {rosterCapped && !loading ? (
          <p className="page-subtitle" role="status">
            Showing the {rosterLoaded} most recent invites.
          </p>
        ) : null}
        {roster.length === 0 && !loading && !inviteOpen ? (
          <div className="dashboard-empty" role="status">
            <p className="dashboard-empty-title mono-data">
              No artisans invited yet.
            </p>
            <p className="dashboard-empty-copy">
              Invite a contact so you can assign jobs from unit Payments.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setInviteOpen(true)}
            >
              Invite artisan
            </button>
          </div>
        ) : roster.length > 0 ? (
          <ul className="dashboard-checklist-list">
            {roster.map((r) => (
              <li key={r.id} className="dashboard-checklist-item">
                <span className="dashboard-checklist-label">
                  {r.invite_contact || r.artisan_user_id || "Artisan"},{" "}
                  {labelOrTitle(ARTISAN_STATUS_LABELS, r.status)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {capped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {loaded} most recent jobs. Portfolio open:{" "}
          <span className="mono-data">{openCount}</span>
          {" · "}
          done: <span className="mono-data">{doneCount}</span>.
        </p>
      ) : null}

      <h2 className="dashboard-checklist-title" style={{ marginTop: 24 }}>
        Open ({openCount})
      </h2>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Origin</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {open.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="table-muted">
                  {openCount > 0
                    ? `No open jobs in this loaded page, but ${openCount} open across the portfolio (newer done jobs may fill the list). Open a unit from Payments to find them.`
                    : "No open jobs. Create from unit Payments or wait for tenant requests."}
                </td>
              </tr>
            ) : (
              open.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.title}</strong>
                    {row.details ? (
                      <p className="table-muted" style={{ margin: "4px 0 0" }}>
                        {row.details}
                      </p>
                    ) : null}
                  </td>
                  <td>{row.origin || "tenant"}</td>
                  <td>{labelOrTitle(MAINTENANCE_STATUS_LABELS, row.status)}</td>
                  <td>
                    <Link
                      href={`/payments/${row.unit_id}`}
                      className="table-link"
                    >
                      Open unit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="dashboard-checklist-title" style={{ marginTop: 24 }}>
        Done ({doneCount})
      </h2>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {done.length === 0 ? (
              <tr>
                <td colSpan={3} className="table-muted">
                  {doneCount > 0
                    ? `No completed jobs in this loaded page (${doneCount} done across the portfolio).`
                    : "No completed jobs yet."}
                </td>
              </tr>
            ) : (
              done.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{labelOrTitle(MAINTENANCE_STATUS_LABELS, row.status)}</td>
                  <td>
                    {row.status === "resolved" ? (
                      <Link
                        href={`/payments/${row.unit_id}?manual=1&charge=other`}
                        className="table-link"
                      >
                        Log other payment
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
