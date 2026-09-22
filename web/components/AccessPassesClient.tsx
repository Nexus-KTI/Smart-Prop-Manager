"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  admitAccessPass,
  createAccessPass,
  fetchAccessOccupants,
  fetchAccessPassEvents,
  fetchAccessPasses,
  fetchProperties,
  revokeAccessPass,
  type AccessOccupant,
  type AccessPass,
  type AccessPassEvent,
  type AdmitAccessResult,
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
  const [admitRaw, setAdmitRaw] = useState("");
  const [admitting, setAdmitting] = useState(false);
  const [lastAdmit, setLastAdmit] = useState<AdmitAccessResult | null>(null);
  const [lastAdmitDenied, setLastAdmitDenied] = useState<string | null>(null);
  const [events, setEvents] = useState<AccessPassEvent[]>([]);

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
      if (propertyId) {
        try {
          setEvents(await fetchAccessPassEvents(propertyId));
        } catch {
          setEvents([]);
        }
      } else {
        setEvents([]);
      }
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

  async function onAdmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    const raw = admitRaw.trim();
    if (!raw) return;
    setAdmitting(true);
    setLastAdmitDenied(null);
    try {
      const result = await admitAccessPass({ property_id: propertyId, raw });
      setLastAdmit(result);
      setAdmitRaw("");
      showToast(
        `Admitted ${result.item.subject_label} · use ${result.uses_count}`,
        "success",
      );
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Admit failed";
      setLastAdmit(null);
      setLastAdmitDenied(msg);
      showToast(msg, "error");
    } finally {
      setAdmitting(false);
    }
  }

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
            Admit at the gate with the 6-character code or a scanned QR. Issue a
            tenant move-in code first so it shows on their Access page. Tenants
            can mint Visit or Open guest codes; you can still issue and revoke
            any pass here.
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

      <form
        className="form-card"
        style={{ marginTop: 16, maxWidth: 480 }}
        onSubmit={(e) => void onAdmit(e)}
      >
        <p className="form-kicker">Admit at gate</p>
        <p className="form-hint">
          Type the code or paste/scan a QR payload. USB scanners that type into
          this field work.
        </p>
        <label className="form-field">
          <span className="form-label">Code or QR</span>
          <input
            className="form-input mono-data"
            value={admitRaw}
            onChange={(e) => setAdmitRaw(e.target.value)}
            placeholder="A1B2C3 or nexora-pass:…"
            autoComplete="off"
            disabled={admitting || !propertyId}
            autoFocus
          />
        </label>
        <div className="form-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={admitting || !propertyId || !admitRaw.trim()}
          >
            {admitting ? "Checking…" : "Admit"}
          </button>
        </div>
        {lastAdmit ? (
          <div
            className="tenant-module-banner"
            data-tone="info"
            role="status"
            style={{ marginTop: 12 }}
          >
            <p className="tenant-module-banner-title">
              Allowed · {lastAdmit.item.subject_label}
            </p>
            <p className="page-subtitle" style={{ margin: 0 }}>
              <span className="mono-data">{lastAdmit.item.code}</span>
              {" · "}
              use {lastAdmit.uses_count}
              {lastAdmit.item.max_uses != null
                ? ` / ${lastAdmit.item.max_uses}`
                : ""}
              {" · until "}
              {new Date(lastAdmit.item.valid_until).toLocaleString()}
            </p>
            <p className="page-subtitle" style={{ margin: "6px 0 0" }}>
              Issued by{" "}
              {lastAdmit.created_by_label ||
                lastAdmit.item.created_by_label ||
                "—"}
              {" · "}
              Admitted by {lastAdmit.admitted_by_label || "—"}
            </p>
          </div>
        ) : null}
        {lastAdmitDenied ? (
          <div
            className="tenant-module-banner"
            data-tone="wait"
            role="status"
            style={{ marginTop: 12 }}
          >
            <p className="tenant-module-banner-title">Denied</p>
            <p className="page-subtitle" style={{ margin: 0 }}>
              {lastAdmitDenied}
            </p>
          </div>
        ) : null}
      </form>

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
              <th>Issued by</th>
              <th>Window</th>
              <th>Uses</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="table-muted">
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
                  <td>
                    <span>{row.created_by_label || "—"}</span>
                    {row.last_admitted_by_label ? (
                      <p className="table-muted" style={{ margin: "4px 0 0" }}>
                        Last admit: {row.last_admitted_by_label}
                        {row.last_admitted_at
                          ? ` · ${new Date(row.last_admitted_at).toLocaleString()}`
                          : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className="table-muted">
                    Until {new Date(row.valid_until).toLocaleString()}
                  </td>
                  <td className="mono-data table-muted">
                    {row.uses_count ?? 0}
                    {row.max_uses != null ? ` / ${row.max_uses}` : ""}
                  </td>
                  <td>
                    {labelOrTitle(
                      ACCESS_STATUS_LABELS,
                      row.effective_status || row.status,
                    )}
                  </td>
                  <td>
                    {(row.effective_status || row.status) === "active" ||
                    (row.effective_status || row.status) === "scheduled" ? (
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

      {events.length > 0 ? (
        <div style={{ marginTop: 24, maxWidth: 640 }}>
          <p className="form-kicker">Gate activity</p>
          <p className="form-hint" style={{ marginBottom: 10 }}>
            Chain of custody — who issued, admitted, or revoked each code.
          </p>
          <ul className="tenant-notice-list">
            {events.map((ev) => {
              const verb =
                ev.event_type === "created"
                  ? "Issued"
                  : ev.event_type === "admitted"
                    ? "Admitted"
                    : ev.event_type === "revoked"
                      ? "Revoked"
                      : ev.event_type;
              return (
                <li key={ev.id} className="tenant-notice-card">
                  <p className="form-kicker" style={{ marginBottom: 4 }}>
                    {verb}
                    {ev.actor_role ? ` · ${ev.actor_role}` : ""}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>{ev.actor_label || "Unknown"}</strong>
                    {ev.subject_label ? ` · ${ev.subject_label}` : ""}
                    {ev.code ? (
                      <>
                        {" · "}
                        <span className="mono-data">{ev.code}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="table-muted" style={{ margin: "6px 0 0" }}>
                    {new Date(ev.created_at).toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
