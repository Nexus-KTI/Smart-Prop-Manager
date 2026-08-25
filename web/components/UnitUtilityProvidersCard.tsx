"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  createUnitUtility,
  deleteUtilityProvider,
  fetchUnitUtilities,
  updateUtilityProvider,
  type UtilityProvider,
} from "@/lib/api";
import { useToast } from "@/components/ToastProvider";

const KINDS = [
  { value: "power", label: "Power" },
  { value: "water", label: "Water" },
  { value: "waste", label: "Waste" },
  { value: "diesel_generator", label: "Generator / diesel" },
  { value: "internet", label: "Internet" },
  { value: "other", label: "Other" },
] as const;

type Props = { unitId: string };

function kindLabel(kind: string): string {
  return KINDS.find((k) => k.value === kind)?.label || kind;
}

export function UnitUtilityProvidersCard({ unitId }: Props) {
  const { showToast } = useToast();
  const [items, setItems] = useState<UtilityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchUnitUtilities(unitId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    try {
      await createUnitUtility(unitId, {
        kind: String(data.get("kind") || ""),
        provider_name: String(data.get("provider_name") || "").trim(),
        account_or_meter: String(data.get("account_or_meter") || "").trim() || undefined,
        how_to_pay: String(data.get("how_to_pay") || "").trim() || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
        is_enabled: data.get("is_enabled") === "on",
      });
      showToast("Utility provider published");
      form.reset();
      setFormOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEnabled(row: UtilityProvider) {
    try {
      await updateUtilityProvider(row.id, { is_enabled: !row.is_enabled });
      showToast(row.is_enabled ? "Hidden from tenant" : "Visible to tenant");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteUtilityProvider(id);
      showToast("Provider removed");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const usedKinds = new Set(items.map((i) => i.kind));
  const availableKinds = KINDS.filter((k) => !usedKinds.has(k.value));

  return (
    <section className="form-card" style={{ marginTop: 20 }} aria-label="Utilities">
      <header className="dashboard-header-row" style={{ marginBottom: 12 }}>
        <div>
          <p className="form-kicker">Tenant utilities</p>
          <h2 className="page-title" style={{ fontSize: "1.15rem", margin: 0 }}>
            Utility providers
          </h2>
          <p className="page-subtitle" style={{ margin: "4px 0 0" }}>
            Published providers show on the tenant Utilities page.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setFormOpen((o) => !o)}
          disabled={availableKinds.length === 0 && !formOpen}
        >
          {formOpen ? "Close" : "Add provider"}
        </button>
      </header>

      {formOpen && availableKinds.length > 0 ? (
        <form className="form-card" onSubmit={(e) => void onSubmit(e)} style={{ marginBottom: 16 }}>
          <label className="form-field">
            <span className="form-label">Kind</span>
            <select className="form-input" name="kind" required disabled={submitting}>
              {availableKinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Provider name</span>
            <input
              className="form-input"
              name="provider_name"
              required
              placeholder="e.g. AEDC, estate borehole"
              disabled={submitting}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Account / meter</span>
            <input className="form-input" name="account_or_meter" disabled={submitting} />
          </label>
          <label className="form-field">
            <span className="form-label">How to pay</span>
            <input
              className="form-input"
              name="how_to_pay"
              placeholder="Buy token at estate office"
              disabled={submitting}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Notes</span>
            <textarea className="form-input" name="notes" rows={2} disabled={submitting} />
          </label>
          <label className="form-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="is_enabled" defaultChecked disabled={submitting} />
            <span className="form-label" style={{ margin: 0 }}>
              Visible to tenant
            </span>
          </label>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Saving…" : "Publish"}
          </button>
        </form>
      ) : null}

      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!loading && items.length === 0 ? (
        <p className="table-muted">No providers yet, tenant sees a landlord wait banner.</p>
      ) : null}

      {items.length > 0 ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Provider</th>
                <th>Visible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{kindLabel(row.kind)}</td>
                  <td>
                    <strong>{row.provider_name}</strong>
                    {row.account_or_meter ? (
                      <p className="table-muted" style={{ margin: "4px 0 0" }}>
                        {row.account_or_meter}
                      </p>
                    ) : null}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-link"
                      onClick={() => void toggleEnabled(row)}
                    >
                      {row.is_enabled ? "Yes" : "No"}
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="table-link"
                      onClick={() => void onDelete(row.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
