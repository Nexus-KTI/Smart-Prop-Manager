"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useToast } from "@/components/ToastProvider";
import {
  decideApplication,
  fetchApplications,
  type RentalApplication,
} from "@/lib/api";
import { APPLICATION_STATUS_LABELS, labelOrTitle } from "@/lib/labels";

const ANSWER_LABELS: Record<string, string> = {
  move_in: "Preferred move-in",
  occupation: "What you do",
  guarantor_name: "Guarantor name",
  guarantor_phone: "Guarantor phone",
};

export function ApplicationsClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<RentalApplication[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [capped, setCapped] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvedUnitId, setApprovedUnitId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApplications();
      setItems(data.items);
      setPendingCount(data.pending_count);
      setCapped(data.capped);
      setLoaded(data.loaded);
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
      const result = await decideApplication(id, status);
      if (status === "approved" && result.unit_id) {
        setApprovedUnitId(String(result.unit_id));
        showToast("Approved", "success");
      } else {
        showToast(status === "approved" ? "Approved" : status, "success");
      }
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed", "error");
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
      {approvedUnitId ? (
        <p className="page-subtitle" role="status">
          Approved.{" "}
          <Link href={`/payments/${approvedUnitId}`} className="table-link">
            Open unit payments
          </Link>
        </p>
      ) : null}
      {!loading && pendingCount > 0 ? (
        <p className="page-subtitle" role="status">
          {pendingCount === 1
            ? "1 application awaiting decide."
            : `${pendingCount} applications awaiting decide.`}
        </p>
      ) : null}
      {capped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {loaded} most recent invites. Older applications may not
          appear in this list.
        </p>
      ) : null}
      {!loading && items.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">
            No application invites yet.
          </p>
          <p className="dashboard-empty-copy">
            From a vacant unit’s Payments page, share an apply link.
          </p>
          <Link href="/properties?occupancy=vacant" className="btn-primary">
            Find vacant units
          </Link>
        </div>
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
              {app.property_name || app.unit_label ? (
                <p className="page-subtitle">
                  {[app.property_name, app.unit_label].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {app.screening_answers
                ? Object.entries(ANSWER_LABELS).map(([key, label]) => {
                    const value = app.screening_answers?.[key];
                    if (!value) return null;
                    return (
                      <p key={key} className="page-subtitle">
                        {label}: {value}
                      </p>
                    );
                  })
                : null}
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
