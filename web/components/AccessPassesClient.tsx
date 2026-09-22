"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  createAccessPass,
  fetchAccessOccupants,
  fetchAccessPasses,
  fetchProperties,
  revokeAccessPass,
  type AccessOccupant,
  type AccessPass,
} from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import {
  ACCESS_STATUS_LABELS,
  ACCESS_SUBJECT_LABELS,
  labelOrTitle,
} from "@/lib/labels";
import type { Property } from "@/lib/types";

export function AccessPassesClient() {
  const { showToast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [occupants, setOccupants] = useState<AccessOccupant[]>([]);
  const [items, setItems] = useState<AccessPass[]>([]);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subjectType, setSubjectType] = useState("guest");
  const [occupantKey, setOccupantKey] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const props = await fetchProperties();
        setProperties(props);
        if (props[0]?.id) setPropertyId(props[0].id);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccessPasses(propertyId || undefined);
      setItems(data.items);
      setListCapped(data.capped);
      setListLoaded(data.loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!propertyId) {
      setOccupants([]);
      return;
    }
    void (async () => {
      try {
        const rows = await fetchAccessOccupants(propertyId);
        setOccupants(rows);
        setOccupantKey(rows[0] ? `${rows[0].unit_id}:${rows[0].tenant_user_id}` : "");
      } catch {
        setOccupants([]);
      }
    })();
  }, [propertyId]);

  async function onIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const validUntilLocal = String(data.get("valid_until") || "");
    if (!validUntilLocal) return;

    const type = String(data.get("subject_type") || subjectType);
    let unit_id: string | undefined;
    let subject_user_id: string | undefined;
    let subject_label = String(data.get("subject_label") || "").trim();

    const selectedKey = String(data.get("occupant") || occupantKey);
    const occupant = occupants.find(
      (o) => `${o.unit_id}:${o.tenant_user_id}` === selectedKey,
    );

    if (type === "tenant") {
      if (!occupant) {
        showToast(
          "Pick a linked tenant so the code shows on their Access page",
          "error",
        );
        return;
      }
      unit_id = occupant.unit_id;
      subject_user_id = occupant.tenant_user_id;
      if (!subject_label) {
        subject_label = `${occupant.tenant_name} · ${occupant.unit_label}`;
      }
    } else if (type === "guest" && data.get("link_tenant") === "on" && occupant) {
      unit_id = occupant.unit_id;
      subject_user_id = occupant.tenant_user_id;
      if (!subject_label) {
        subject_label = `Guest of ${occupant.tenant_name}`;
      }
    }

    setSubmitting(true);
    try {
      await createAccessPass({
        property_id: propertyId,
        unit_id,
        subject_type: type,
        subject_label,
        subject_user_id,
        valid_until: new Date(validUntilLocal).toISOString(),
      });
      showToast(
        subject_user_id
          ? "Gate code issued. Tenant can open Access"
          : "Gate code issued",
        "success",
      );
      form.reset();
      setSubjectType("guest");
      setFormOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Issue failed", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(id: string) {
    try {
      await revokeAccessPass(id);
      showToast("Pass revoked", "success");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Revoke failed", "error");
    }
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Gate codes</h1>
          <p className="page-subtitle">
            Issue a tenant move-in code first so it shows on their Access page.
            After that, tenants can mint short guest codes themselves. You can
            still issue and revoke any pass here.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/work-orders" className="btn-secondary">
            Work orders
          </Link>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setFormOpen((o) => !o)}
          >
            {formOpen ? "Close" : "Issue access code"}
          </button>
        </div>
      </header>

      <label className="form-field" style={{ maxWidth: 320 }}>
        <span className="form-label">Property</span>
        <select
          className="form-input"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {formOpen ? (
        <form className="form-card" onSubmit={(e) => void onIssue(e)} style={{ marginTop: 16 }}>
          <label className="form-field">
            <span className="form-label">Who</span>
            <select
              className="form-input"
              name="subject_type"
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value)}
              disabled={submitting}
            >
              <option value="guest">Guest</option>
              <option value="tenant">Tenant (shows on their Access)</option>
              <option value="contractor">Contractor</option>
              <option value="artisan">Artisan</option>
            </select>
          </label>

          {subjectType === "tenant" || subjectType === "guest" ? (
            <label className="form-field">
              <span className="form-label">
                {subjectType === "tenant" ? "Linked tenant" : "Unit tenant (optional link)"}
              </span>
              {occupants.length === 0 ? (
                <p className="form-hint">
                  No active claimed tenancies on this property yet. Activate a
                  tenant first to link the code.
                </p>
              ) : (
                <select
                  className="form-input"
                  name="occupant"
                  value={occupantKey}
                  onChange={(e) => setOccupantKey(e.target.value)}
                  required={subjectType === "tenant"}
                  disabled={submitting}
                >
                  {occupants.map((o) => (
                    <option
                      key={`${o.unit_id}:${o.tenant_user_id}`}
                      value={`${o.unit_id}:${o.tenant_user_id}`}
                    >
                      {o.tenant_name} · {o.unit_label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ) : null}

          {subjectType === "guest" && occupants.length > 0 ? (
            <label className="form-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="link_tenant" defaultChecked disabled={submitting} />
              <span className="form-label" style={{ margin: 0 }}>
                Show this guest code on the tenant’s Access page
              </span>
            </label>
          ) : null}

          <label className="form-field">
            <span className="form-label">Label</span>
            <input
              className="form-input"
              name="subject_label"
              required={subjectType !== "tenant"}
              placeholder="e.g. Ada’s visitor"
              disabled={submitting}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Valid until</span>
            <input
              className="form-input"
              name="valid_until"
              type="datetime-local"
              required
              disabled={submitting}
            />
          </label>
          <button
            type="submit"
            className="btn-primary"
            disabled={
              submitting ||
              !propertyId ||
              (subjectType === "tenant" && occupants.length === 0)
            }
          >
            {submitting ? "Issuing…" : "Issue code"}
          </button>
        </form>
      ) : null}

      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {listCapped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {listLoaded} most recent codes. Older passes may not
          appear here.
        </p>
      ) : null}

      {!loading && items.length === 0 && !formOpen ? (
        <div className="dashboard-empty" role="status" style={{ marginTop: 16 }}>
          <p className="dashboard-empty-title mono-data">No gate codes yet.</p>
          <p className="dashboard-empty-copy">
            Issue a pass for a guest, tenant, or contractor.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setFormOpen(true)}
          >
            Issue access code
          </button>
        </div>
      ) : null}

      {items.length > 0 || loading || formOpen ? (
      <div className="data-table-wrap" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Who</th>
              <th>Code</th>
              <th>Window</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="table-muted">
                  No gate codes yet.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.subject_label}</strong>
                    <p className="table-muted" style={{ margin: "4px 0 0" }}>
                      {labelOrTitle(ACCESS_SUBJECT_LABELS, row.subject_type)}
                      {row.subject_user_id ? " · linked to account" : ""}
                    </p>
                  </td>
                  <td className="mono-data">{row.code}</td>
                  <td className="table-muted">
                    Until {new Date(row.valid_until).toLocaleString()}
                  </td>
                  <td>
                    {labelOrTitle(
                      ACCESS_STATUS_LABELS,
                      row.effective_status || row.status,
                    )}
                  </td>
                  <td>
                    {(row.effective_status || row.status) === "active" ? (
                      <button
                        type="button"
                        className="table-link"
                        onClick={() => void onRevoke(row.id)}
                      >
                        Revoke
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      ) : null}
    </section>
  );
}
