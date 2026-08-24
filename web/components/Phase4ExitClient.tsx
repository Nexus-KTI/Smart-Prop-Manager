"use client";

import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { fetchPhase4Exit, type Phase4ExitReport } from "@/lib/api";

export function Phase4ExitClient() {
  const [report, setReport] = useState<Phase4ExitReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchPhase4Exit());
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
    return <p className="page-subtitle">Loading Phase 4 exit metrics…</p>;
  }

  if (error && !report) {
    return (
      <FetchErrorState
        title="Couldn’t load Phase 4 exit"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!report) return null;

  const m1 = report.metric_1_multi_portfolio_manager;
  const m2 = report.metric_2_staff_leverage;

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Phase 4 exit</h1>
        <p className="page-subtitle">
          as of <span className="mono-data">{report.as_of}</span>
        </p>
      </header>
      <div className="stat-row">
        <div className="stat-block">
          <p className="stat-label">Multi-portfolio Manager</p>
          <p className="stat-value mono-data">
            {m1.exit_bar_met ? "Met" : "Not met"}
          </p>
          <p className="table-muted">
            {m1.managers_with_ge_2_portfolios} manager(s) on 2+ portfolios
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Staff leverage</p>
          <p className="stat-value mono-data">{m2.units_per_staff}</p>
          <p className="table-muted">
            {m2.units_under_management} units / {m2.active_staff_users} staff
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Active memberships</p>
          <p className="stat-value mono-data">{report.active_memberships}</p>
        </div>
      </div>
      <p className="page-subtitle">{m1.definition}</p>
      <p className="page-subtitle">{m2.definition}</p>
      <p className="table-muted">
        CLI: <span className="mono-data">python scripts/phase4_exit_check.py</span>
      </p>
    </section>
  );
}
