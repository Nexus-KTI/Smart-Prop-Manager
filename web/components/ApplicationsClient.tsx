"use client";

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  decideApplication,
  fetchApplications,
  type RentalApplication,
} from "@/lib/api";
import { APPLICATION_STATUS_LABELS, labelOrTitle } from "@/lib/labels";

export function ApplicationsClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<RentalApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchApplications());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, status: "approved" | "rejected" | "closed") {
    try {
      await decideApplication(id, status);
      showToast(status === "approved" ? "Approved. Draft tenancy if vacant" : status);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Applications</h1>
        <p className="page-subtitle">
          Open an apply link from unit Payments. Review submissions here.
        </p>
      </header>
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="table-muted">No application invites yet.</p>
      ) : (
        <ul className="stack-list">
          {items.map((app) => (
            <li key={app.id} className="form-card">
              <p>
                <strong>{app.applicant_name || "Open invite"}</strong>{" "}
                <span className="table-muted">
                  · {labelOrTitle(APPLICATION_STATUS_LABELS, app.status)}
                </span>
              </p>
              {app.applicant_email ? (
                <p className="page-subtitle">{app.applicant_email}</p>
              ) : null}
              {app.applicant_phone ? (
                <p className="page-subtitle">{app.applicant_phone}</p>
              ) : null}
              {app.notes ? <p className="page-subtitle">{app.notes}</p> : null}
              {app.status === "submitted" ? (
                <div className="dashboard-header-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void decide(app.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void decide(app.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
              {app.status === "open" ? (
                <p className="table-muted mono-data">/apply/{app.invite_token}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
