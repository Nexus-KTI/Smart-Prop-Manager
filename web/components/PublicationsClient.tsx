"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  archivePublication,
  createPublication,
  fetchPublications,
  type Publication,
} from "@/lib/api";

export function PublicationsClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublications();
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      await createPublication({
        title: String(data.get("title") || "").trim(),
        body: String(data.get("body") || "").trim(),
      });
      showToast("Published to tenant notices");
      event.currentTarget.reset();
      setOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Publish failed", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Bulletin</h1>
          <p className="page-subtitle">
            Estate posts your tenants see under Notices.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "New post"}
        </button>
      </header>
      {open ? (
        <form className="form-card" onSubmit={onSubmit}>
          <label className="form-field">
            <span className="form-label">Title</span>
            <input name="title" required className="form-input" maxLength={160} />
          </label>
          <label className="form-field">
            <span className="form-label">Body</span>
            <textarea name="body" required className="form-input" rows={5} />
          </label>
          <button type="submit" className="btn-primary" disabled={pending}>
            Publish
          </button>
        </form>
      ) : null}
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {listCapped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {listLoaded} most recent posts. Older bulletin items may
          not appear here.
        </p>
      ) : null}
      {items.length > 0 ? (
      <ul className="stack-list">
        {items.map((p) => (
          <li key={p.id} className="form-card">
            <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
              {p.title}
            </h2>
            <p className="page-subtitle">{p.body}</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                void archivePublication(p.id)
                  .then(load)
                  .catch((err) =>
                    showToast(err instanceof Error ? err.message : "Archive failed", "error"),
                  )
              }
            >
              Archive
            </button>
          </li>
        ))}
      </ul>
      ) : null}
      {!loading && items.length === 0 && !open ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No posts yet.</p>
          <p className="dashboard-empty-copy">
            Publish an estate notice so tenants see it under Notices.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setOpen(true)}
          >
            New post
          </button>
        </div>
      ) : null}
    </section>
  );
}
