"use client";

import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  fetchPhase2Exit,
  type Phase2ExitReport,
} from "@/lib/api";

export function Phase2ExitClient() {
  const [report, setReport] = useState<Phase2ExitReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchPhase2Exit(30));
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
    return <p className="page-subtitle">Loading Phase 2 exit metrics…</p>;
  }

  if (error && !report) {
    return (
      <FetchErrorState
        title="Couldn’t load Phase 2 exit"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!report) return null;

  const m1 = report.metric_1_non_rent_collection;
  const m2 = report.metric_2_renewal_visibility;
  const m2b = report.metric_2b_renewal_banner_views;

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Phase 2 exit</h1>
          <p className="page-subtitle">
            Trailing {report.window_days} days · as of{" "}
            <span className="mono-data">{report.as_of}</span>
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Value</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1. Non-rent collection</td>
              <td className="mono-data">{m1.percent}%</td>
              <td className="table-muted">
                {m1.landlords_with_paid_non_rent} / {m1.active_landlords}{" "}
                active landlords
              </td>
            </tr>
            <tr>
              <td>2. Renewal visibility</td>
              <td className="mono-data">{m2.percent}%</td>
              <td className="table-muted">
                {m2.occupied_with_term_end} / {m2.occupied_units} occupied units
                with term_end
              </td>
            </tr>
            <tr>
              <td>2b. Renewal banner viewed</td>
              <td className="mono-data">{m2b.views}</td>
              <td className="table-muted">
                {m2b.distinct_landlords} landlords · {m2b.distinct_units} units
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="page-subtitle" style={{ marginTop: 16 }}>
        Re-run from the API with{" "}
        <span className="mono-data">GET /admin/phase2-exit?plain=1</span> or{" "}
        <span className="mono-data">python scripts/phase2_exit_check.py</span>.
      </p>
    </section>
  );
}
