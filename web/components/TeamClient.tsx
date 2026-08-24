"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  fetchStaffTeam,
  inviteStaff,
  revokeStaffMembership,
  type StaffMembership,
} from "@/lib/api";

export function TeamClient() {
  const [items, setItems] = useState<StaffMembership[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [claimPath, setClaimPath] = useState<string | null>(null);
  const [role, setRole] = useState<"manager" | "caretaker">("caretaker");
  const [contact, setContact] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffTeam();
      setItems(data.items);
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
    setBusy(true);
    setError(null);
    try {
      const result = await inviteStaff({ role, contact: contact.trim() });
      setClaimPath(result.claim_path);
      setContact("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
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
          <p className="form-kicker">Owner / Manager</p>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">
            Invite Managers and Caretakers. They claim via OTP — same path as
            tenant invites.
          </p>
        </div>
        <Link href="/ops" className="btn-secondary">
          Chase ops
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
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="table-muted">
                  No staff yet.
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.id}>
                  <td>{m.role}</td>
                  <td className="mono-data">{m.invite_contact || "—"}</td>
                  <td>
                    <span className="status-badge pending">{m.status}</span>
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
