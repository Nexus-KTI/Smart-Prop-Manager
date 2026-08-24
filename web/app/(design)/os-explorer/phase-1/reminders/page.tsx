import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { mockReminders } from "../../mock/data";

export default function Phase1RemindersPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Reminders · PRD J3 /
        F4
      </p>
      <h1 className="page-title">Reminders</h1>
      <p className="page-subtitle">
        Preferred channel only. Failed rows show detail + Retry.
      </p>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          Send reminder
        </button>
      </div>
      <div className="osx-stack">
        {mockReminders.map((r) => (
          <div key={r.id} className="osx-row">
            <div>
              <div>
                {r.unit} · {r.channel}
              </div>
              <div className="osx-muted mono-data">{r.at}</div>
              {r.status === "failed" ? (
                <div className="osx-alert-text">{r.detail}</div>
              ) : null}
            </div>
            <div className="osx-row-actions">
              <StatusBadge status={r.status} />
              {r.status === "failed" ? (
                <button type="button" className="btn-primary">
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
