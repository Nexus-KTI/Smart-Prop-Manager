"use client";

import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { fetchStaffAudit } from "@/lib/api";

export function AuditLogClient() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      actor_user_id: string;
      actor_role: string;
      action: string;
      target_type?: string | null;
      target_id?: string | null;
      created_at: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchStaffAudit(50));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="page-subtitle">Loading audit…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load audit log"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Staff audit</h1>
        <p className="page-subtitle">
          Money and chase actions taken by Managers and Caretakers on your
          portfolio.
        </p>
      </header>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Role</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="table-muted">
                  No staff actions yet.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id}>
                  <td className="mono-data">
                    {new Date(row.created_at).toLocaleString("en-GB")}
                  </td>
                  <td>{row.actor_role}</td>
                  <td>{row.action}</td>
                  <td className="mono-data">
                    {row.target_type || "—"}
                    {row.target_id ? ` · ${row.target_id.slice(0, 8)}` : ""}
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
