"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { TenantLeaseGate } from "@/components/TenantLeaseGate";
import { useToast } from "@/components/ToastProvider";
import {
  cancelMyMaintenanceRequest,
  createMyMaintenanceRequest,
  fetchMyMaintenanceRequests,
  openMaintenanceThread,
  uploadMaintenancePhoto,
  type MaintenanceRequest,
} from "@/lib/api";
import {
  MAINTENANCE_STATUS_LABELS,
  PRIORITY_LABELS,
  labelOrTitle,
} from "@/lib/labels";

export function TenantRequestsClient() {
  const { showToast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      setItems(await fetchMyMaintenanceRequests());
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function clearPhoto() {
    setPhotoFile(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const details = String(data.get("details") || "").trim();
    const priority = String(data.get("priority") || "normal");
    const category = String(data.get("category") || "general");
    const preferred_time = String(data.get("preferred_time") || "").trim();
    const allow_entry = data.get("allow_entry") === "on";
    if (!title) return;

    setSubmitting(true);
    try {
      let photo_url: string | undefined;
      if (photoFile) {
        photo_url = await uploadMaintenancePhoto(photoFile);
      }
      await createMyMaintenanceRequest({
        title,
        details: details || undefined,
        priority,
        category,
        photo_url,
        preferred_time: preferred_time || undefined,
        allow_entry,
      });
      showToast("Request sent to your landlord");
      form.reset();
      clearPhoto();
      setFormOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not submit", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel(id: string) {
    try {
      await cancelMyMaintenanceRequest(id);
      showToast("Request canceled");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not cancel", "error");
    }
  }

  return (
    <TenantLeaseGate
      title="Requests"
      subtitle="Repair and maintenance requests for your unit."
    >
      {() => (
        <>
          <div className="dashboard-header-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() =>
                setFormOpen((open) => {
                  if (open) clearPhoto();
                  return !open;
                })
              }
            >
              {formOpen ? "Close form" : "New request"}
            </button>
            <Link href="/tenant" className="btn-secondary">
              Back to home
            </Link>
          </div>

          {formOpen ? (
            <form className="form-card" onSubmit={(e) => void onSubmit(e)} style={{ marginTop: 16 }}>
              <label className="form-field">
                <span className="form-label">Title</span>
                <input
                  className="form-input"
                  name="title"
                  required
                  maxLength={120}
                  placeholder="e.g. Leaking kitchen tap"
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span className="form-label">Details</span>
                <textarea
                  className="form-input"
                  name="details"
                  rows={3}
                  maxLength={2000}
                  placeholder="What happened, when, and any access notes"
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span className="form-label">Category</span>
                <select className="form-input" name="category" defaultValue="general" disabled={submitting}>
                  <option value="general">General</option>
                  <option value="plumbing">Plumbing</option>
                  <option value="electrical">Electrical</option>
                  <option value="hvac">HVAC / AC</option>
                  <option value="appliance">Appliance</option>
                  <option value="structural">Structural</option>
                  <option value="pest">Pest</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">Priority</span>
                <select className="form-input" name="priority" defaultValue="normal" disabled={submitting}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label className="form-field">
                <span className="form-label">Preferred time (optional)</span>
                <input
                  className="form-input"
                  name="preferred_time"
                  maxLength={120}
                  placeholder="e.g. Weekday mornings"
                  disabled={submitting}
                />
              </label>
              <label className="form-field">
                <span className="form-label">Photo (optional)</span>
                <input
                  className="form-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={submitting}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 5 * 1024 * 1024) {
                      showToast("Image must be 5 MB or smaller", "error");
                      e.target.value = "";
                      clearPhoto();
                      return;
                    }
                    setPhotoFile(file);
                  }}
                />
                <span className="table-muted" style={{ display: "block", marginTop: 4 }}>
                  JPEG, PNG, or WebP · max 5 MB
                </span>
                {photoPreview ? (
                  <div className="mr-photo-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview} alt="Selected repair photo" className="mr-photo-thumb" />
                    <button
                      type="button"
                      className="table-link"
                      disabled={submitting}
                      onClick={() => clearPhoto()}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </label>
              <label className="form-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="allow_entry" disabled={submitting} />
                <span className="form-label" style={{ margin: 0 }}>
                  Allow entry if I’m away
                </span>
              </label>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "Sending…" : "Submit request"}
              </button>
            </form>
          ) : null}

          {listLoading ? (
            <p className="page-subtitle" style={{ marginTop: 16 }}>
              Loading requests…
            </p>
          ) : null}
          {listError ? <p className="form-error">{listError}</p> : null}

          <div className="data-table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !listLoading ? (
                  <tr>
                    <td colSpan={5} className="table-muted">
                      No repair requests yet. Submit one when something needs
                      fixing, your landlord sees it on this unit’s Payments page.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.title}</strong>
                        {row.details ? (
                          <p className="table-muted" style={{ margin: "4px 0 0" }}>
                            {row.details}
                          </p>
                        ) : null}
                        {row.photo_url ? (
                          <p style={{ margin: "6px 0 0" }}>
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
                      </td>
                      <td>{row.category || "general"}</td>
                      <td>{labelOrTitle(PRIORITY_LABELS, row.priority)}</td>
                      <td>{labelOrTitle(MAINTENANCE_STATUS_LABELS, row.status)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-link"
                          onClick={() =>
                            void openMaintenanceThread(row.id)
                              .then(() => router.push("/tenant/messages"))
                              .catch((err) =>
                                showToast(
                                  err instanceof Error ? err.message : "Could not open messages",
                                  "error",
                                ),
                              )
                          }
                        >
                          Message
                        </button>
                        {row.status === "new" || row.status === "in_progress" ? (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className="table-link"
                              onClick={() => void onCancel(row.id)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </TenantLeaseGate>
  );
}
