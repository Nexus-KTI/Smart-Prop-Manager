"use client";

import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { fetchPhase3Exit, type Phase3ExitReport } from "@/lib/api";

export function Phase3ExitClient() {
  const [report, setReport] = useState<Phase3ExitReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchPhase3Exit(30));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load metrics.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !report) {
    return <p className="page-subtitle">Loading Phase 3 exit metrics…</p>;
  }

  if (error && !report) {
    return (
      <FetchErrorState
        title="Couldn’t load Phase 3 exit"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!report) return null;

  const m1 = report.metric_1_checklist_before_active;
  const m2 = report.metric_2_tenant_initiated_payments;

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Phase 3 exit</h1>
        <p className="page-subtitle">
          Trailing {report.window_days} days · as of{" "}
          <span className="mono-data">{report.as_of}</span>
        </p>
      </header>
      <div className="stat-row">
        <div className="stat-block">
          <p className="stat-label">Checklist before active</p>
          <p className="stat-value mono-data">{m1.percent}%</p>
          <p className="table-muted">
            {m1.with_required_checklist} / {m1.activated_tenancies} activated
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Tenant-initiated payments</p>
          <p className="stat-value mono-data">{m2.percent}%</p>
          <p className="table-muted">
            {m2.tenant_initiated} / {m2.eligible_paid_transactions} eligible
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Optional identity done</p>
          <p className="stat-value mono-data">{m1.optional_identity_complete}</p>
          <p className="table-muted">Not an activation gate</p>
        </div>
      </div>
      <p className="page-subtitle">{m1.definition}</p>
      <p className="page-subtitle">{m2.definition}</p>
      <p className="table-muted">
        CLI: <span className="mono-data">python scripts/phase3_exit_check.py</span>
      </p>
    </section>
  );
}
