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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchPublications());
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
      showToast(err instanceof Error ? err.message : "Publish failed");
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
          <label className="form-label">
            Title
            <input name="title" required className="form-input" maxLength={160} />
          </label>
          <label className="form-label">
            Body
            <textarea name="body" required className="form-input" rows={5} />
          </label>
          <button type="submit" className="btn-primary" disabled={pending}>
            Publish
          </button>
        </form>
      ) : null}
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
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
                    showToast(err instanceof Error ? err.message : "Archive failed"),
                  )
              }
            >
              Archive
            </button>
          </li>
        ))}
      </ul>
      {!loading && items.length === 0 ? (
        <p className="table-muted">No posts yet.</p>
      ) : null}
    </section>
  );
}
