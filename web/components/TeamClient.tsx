"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { useToast } from "@/components/ToastProvider";
import {
  fetchProperties,
  fetchStaffTeam,
  inviteStaff,
  revokeStaffMembership,
  type StaffMembership,
} from "@/lib/api";
import {
  STAFF_ROLE_LABELS,
  STAFF_STATUS_LABELS,
  labelOrTitle,
} from "@/lib/labels";
import type { Property } from "@/lib/types";

function scopeLabel(membership: StaffMembership): string {
  if (membership.scope_all_properties !== false) return "All properties";
  const names = (membership.properties || [])
    .map((property) => property.name)
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Selected properties";
}

export function TeamClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<StaffMembership[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [claimPath, setClaimPath] = useState<string | null>(null);
  const [role, setRole] = useState<"manager" | "caretaker">("caretaker");
  const [contact, setContact] = useState("");
  const [scopeAll, setScopeAll] = useState(true);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, propertyRows] = await Promise.all([
        fetchStaffTeam(),
        fetchProperties().catch(() => [] as Property[]),
      ]);
      setItems(data.items);
      setProperties(propertyRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    if (!scopeAll && selectedPropertyIds.length === 0) {
      showToast("Choose at least one property", "error");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await inviteStaff({
        role,
        contact: contact.trim(),
        ...(scopeAll ? {} : { property_ids: selectedPropertyIds }),
      });
      setClaimPath(result.claim_path);
      setContact("");
      setScopeAll(true);
      setSelectedPropertyIds([]);
      if (result.notify?.sent) {
        showToast("Staff invited — notify queued", "success");
      } else if (result.notify?.error) {
        showToast("Staff invited — could not queue notify", "success");
      } else {
        showToast("Staff invited", "success");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
      showToast(err instanceof Error ? err.message : "Invite failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="page-subtitle">Loading team…</p>;
  if (error && items.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load team"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">
            Invite Managers and Caretakers. They claim via OTP, same path as
            tenant invites.
          </p>
        </div>
        <Link href="/ops" className="btn-secondary">
          Across owners
        </Link>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <form className="form-card" onSubmit={onInvite}>
        <label className="form-field">
          <span className="form-label">Role</span>
          <select
            className="form-input"
            value={role}
            onChange={(e) => setRole(e.target.value as "manager" | "caretaker")}
            disabled={busy}
          >
            <option value="caretaker">Caretaker</option>
            <option value="manager">Manager (PM)</option>
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">Phone or email</span>
          <input
            className="form-input"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            required
            disabled={busy}
            placeholder="+234…"
          />
        </label>
        <fieldset className="form-field">
          <legend className="form-label">Properties</legend>
          <label className="form-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              name="staff-scope"
              checked={scopeAll}
              disabled={busy}
              onChange={() => setScopeAll(true)}
            />
            <span>All properties</span>
          </label>
          <label className="form-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="radio"
              name="staff-scope"
              checked={!scopeAll}
              disabled={busy || properties.length === 0}
              onChange={() => setScopeAll(false)}
            />
            <span>Selected properties</span>
          </label>
          {!scopeAll ? (
            <div className="stack-list">
              {properties.map((property) => {
                const checked = selectedPropertyIds.includes(property.id);
                return (
                  <label key={property.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={() => {
                        setSelectedPropertyIds((current) =>
                          checked
                            ? current.filter((id) => id !== property.id)
                            : [...current, property.id],
                        );
                      }}
                    />
                    <span>{property.name}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </fieldset>
        <button type="submit" className="btn-primary" disabled={busy}>
          Invite staff
        </button>
      </form>
      {claimPath ? (
        <p className="page-subtitle">
          Claim link: <span className="mono-data">{claimPath}</span>
        </p>
      ) : null}

      <div className="data-table-wrap" style={{ marginTop: 24 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Contact</th>
              <th>Properties</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-muted">
                  No staff yet.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.id}>
                  <td>{labelOrTitle(STAFF_ROLE_LABELS, m.role)}</td>
                  <td className="mono-data">{m.invite_contact || "-"}</td>
                  <td>{scopeLabel(m)}</td>
                  <td>
                    <span className="status-badge pending">
                      {labelOrTitle(STAFF_STATUS_LABELS, m.status)}
                    </span>
                  </td>
                  <td>
                    {m.status !== "revoked" ? (
                      <button
                        type="button"
                        className="table-link"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void revokeStaffMembership(m.id)
                            .then(load)
                            .catch((err) =>
                              setError(
                                err instanceof Error ? err.message : "Revoke failed",
                              ),
                            )
                            .finally(() => setBusy(false));
                        }}
                      >
                        Revoke
                      </button>
                    ) : null}
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
