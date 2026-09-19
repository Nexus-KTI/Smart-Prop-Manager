"use client";

import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  completeMaintenanceRequest,
  fetchArtisanJobs,
  type MaintenanceRequest,
} from "@/lib/api";
import { useToast } from "@/components/ToastProvider";

function passCode(row: MaintenanceRequest): string | null {
  const p = row.access_passes;
  if (!p) return null;
  if (Array.isArray(p)) return p[0]?.code || null;
  return p.code || null;
}

export function ArtisanJobsClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchArtisanJobs();
      setItems(data.items);
      setListCapped(data.capped);
      setListLoaded(data.loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onComplete(id: string) {
    try {
      await completeMaintenanceRequest(id);
      showToast("Job marked done");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not complete", "error");
    }
  }

  if (loading) return <p className="page-subtitle">Loading jobs…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load jobs"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  const open = items.filter((i) => i.status !== "resolved" && i.status !== "canceled");

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Your jobs</h1>
        <p className="page-subtitle">
          Assigned repair jobs. Use the gate code during your window, then mark
          done.
        </p>
      </header>
      {listCapped ? (
        <p className="page-subtitle" role="status">
          Showing the {listLoaded} most recent jobs. Older assignments may not
          appear here.
        </p>
      ) : null}

      {open.length === 0 ? (
        <p className="table-muted">No open jobs assigned to you.</p>
      ) : (
        <ul className="tenant-notice-list">
          {open.map((row) => {
            const code = passCode(row);
            return (
              <li key={row.id} className="tenant-notice-card">
                <h2 className="tenant-notice-title">{row.title}</h2>
                {row.details ? (
                  <p className="page-subtitle" style={{ margin: 0 }}>
                    {row.details}
                  </p>
                ) : null}
                {row.photo_url ? (
                  <p style={{ margin: "8px 0 0" }}>
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
                {row.scheduled_start || row.scheduled_end ? (
                  <p className="table-muted">
                    Window:{" "}
                    {row.scheduled_start
                      ? new Date(row.scheduled_start).toLocaleString()
                      : "-"}{" "}
                    →{" "}
                    {row.scheduled_end
                      ? new Date(row.scheduled_end).toLocaleString()
                      : "-"}
                  </p>
                ) : null}
                {code ? (
                  <p className="stat-value mono-data" style={{ fontSize: "1.35rem" }}>
                    Gate code {code}
                  </p>
                ) : null}
                <div className="dashboard-header-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void onComplete(row.id)}
                  >
                    Mark done
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
