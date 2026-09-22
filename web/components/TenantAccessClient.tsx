"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { useToast } from "@/components/ToastProvider";
import {
  createMyGuestPass,
  fetchMyAccessPasses,
  revokeMyGuestPass,
  type AccessPass,
} from "@/lib/api";

function defaultValidUntilLocal(hours: number): string {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TenantAccessClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AccessPass[]>([]);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);
  const [canCreateGuest, setCanCreateGuest] = useState(false);
  const [guestActiveCount, setGuestActiveCount] = useState(0);
  const [guestMaxActive, setGuestMaxActive] = useState(3);
  const [guestMaxHours, setGuestMaxHours] = useState(48);
  const [unitLabel, setUnitLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [guestLabel, setGuestLabel] = useState("");
  const [validUntil, setValidUntil] = useState(() => defaultValidUntilLocal(24));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyAccessPasses();
      setItems(data.items);
      setListCapped(data.capped);
      setListLoaded(data.loaded);
      setCanCreateGuest(data.can_create_guest);
      setGuestActiveCount(data.guest_active_count);
      setGuestMaxActive(data.guest_max_active);
      setGuestMaxHours(data.guest_max_hours);
      setUnitLabel(data.tenancy?.unit_label ?? null);
      setValidUntil(defaultValidUntilLocal(Math.min(24, data.guest_max_hours)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () => items.filter((i) => (i.effective_status || i.status) === "active"),
    [items],
  );

  const maxValidUntilLocal = useMemo(
    () => defaultValidUntilLocal(guestMaxHours),
    [guestMaxHours],
  );

  async function onCreateGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = guestLabel.trim();
    if (!label || !validUntil) return;
    setSubmitting(true);
    try {
      const iso = new Date(validUntil).toISOString();
      await createMyGuestPass({ subject_label: label, valid_until: iso });
      showToast("Guest code created", "success");
      setGuestLabel("");
      await load();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not create guest code",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onRevoke(passId: string) {
    setRevokingId(passId);
    try {
      await revokeMyGuestPass(passId);
      showToast("Guest code revoked", "success");
      await load();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not revoke",
        "error",
      );
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) return <p className="page-subtitle">Loading access…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load access"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  const atGuestCap = guestActiveCount >= guestMaxActive;

  return (
    <section className="dashboard">
      <h1 className="page-title">Gate codes</h1>
      <p className="page-subtitle">
        Your landlord issues the move-in code. After you’re settled, create
        short guest codes here for visitors — show the code at the estate gate.
        {unitLabel ? (
          <>
            {" "}
            Unit: <span className="mono-data">{unitLabel}</span>.
          </>
        ) : null}
      </p>
      {listCapped ? (
        <p className="page-subtitle" role="status">
          Showing the {listLoaded} most recent codes. Older passes may not
          appear here.
        </p>
      ) : null}

      {canCreateGuest ? (
        <form
          className="form-card"
          style={{ marginBottom: 20, maxWidth: 420 }}
          onSubmit={(e) => void onCreateGuest(e)}
        >
          <p className="form-kicker">Guest code</p>
          <p className="form-hint">
            Max {guestMaxHours} hours · up to {guestMaxActive} active at once (
            {guestActiveCount}/{guestMaxActive} used).
          </p>
          <label className="form-field">
            <span className="form-label">Guest name</span>
            <input
              className="form-input"
              value={guestLabel}
              onChange={(e) => setGuestLabel(e.target.value)}
              placeholder="e.g. Mama visiting"
              required
              disabled={submitting || atGuestCap}
              maxLength={120}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Valid until</span>
            <input
              className="form-input"
              type="datetime-local"
              value={validUntil}
              max={maxValidUntilLocal}
              onChange={(e) => setValidUntil(e.target.value)}
              required
              disabled={submitting || atGuestCap}
            />
          </label>
          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || atGuestCap || !guestLabel.trim()}
            >
              {submitting ? "Creating…" : "Create guest code"}
            </button>
          </div>
          {atGuestCap ? (
            <p className="form-hint" role="status">
              Revoke an active guest code before creating another.
            </p>
          ) : null}
        </form>
      ) : (
        <div className="tenant-module-banner" data-tone="wait" role="status">
          <p className="tenant-module-banner-title">No active tenancy linked</p>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Claim your invite and ask your landlord to activate occupancy before
            you can mint guest codes.
          </p>
        </div>
      )}

      {active.length === 0 ? (
        canCreateGuest ? (
          <div className="tenant-module-banner" data-tone="wait" role="status">
            <p className="tenant-module-banner-title">No active codes yet</p>
            <p className="page-subtitle" style={{ margin: 0 }}>
              Ask your landlord for a move-in code, or create a guest code above
              for a visitor.
            </p>
          </div>
        ) : null
      ) : (
        <ul className="tenant-notice-list">
          {active.map((row) => {
            const canRevoke = row.source_type === "tenant_self";
            const kind =
              row.subject_type === "tenant"
                ? "Move-in / resident"
                : row.subject_type === "guest"
                  ? "Guest"
                  : row.subject_type;
            return (
              <li key={row.id} className="tenant-notice-card">
                <p className="form-kicker" style={{ marginBottom: 4 }}>
                  {kind}
                </p>
                <h2 className="tenant-notice-title">{row.subject_label}</h2>
                <p
                  className="stat-value mono-data"
                  style={{ fontSize: "1.5rem" }}
                >
                  {row.code}
                </p>
                <p className="table-muted">
                  Valid until {new Date(row.valid_until).toLocaleString()}
                </p>
                {canRevoke ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: 10 }}
                    disabled={revokingId === row.id}
                    onClick={() => void onRevoke(row.id)}
                  >
                    {revokingId === row.id ? "Revoking…" : "Revoke"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p style={{ marginTop: 16 }}>
        <Link href="/tenant" className="table-link">
          Back to home
        </Link>
      </p>
    </section>
  );
}
