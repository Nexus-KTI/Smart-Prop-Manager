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

const DEFAULT_DURATIONS = [1, 2, 4, 6] as const;

export function TenantAccessClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AccessPass[]>([]);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);
  const [canCreateGuest, setCanCreateGuest] = useState(false);
  const [guestActiveCount, setGuestActiveCount] = useState(0);
  const [guestMaxActive, setGuestMaxActive] = useState(2);
  const [guestMaxHours, setGuestMaxHours] = useState(6);
  const [guestDurations, setGuestDurations] = useState<number[]>([
    ...DEFAULT_DURATIONS,
  ]);
  const [guestMaxUses, setGuestMaxUses] = useState(1);
  const [unitLabel, setUnitLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [guestLabel, setGuestLabel] = useState("");
  const [durationHours, setDurationHours] = useState(2);

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
      const durations =
        data.guest_duration_hours?.length > 0
          ? data.guest_duration_hours
          : [...DEFAULT_DURATIONS];
      setGuestDurations(durations);
      setGuestMaxUses(data.guest_max_uses ?? 1);
      setUnitLabel(data.tenancy?.unit_label ?? null);
      setDurationHours((prev) =>
        durations.includes(prev) ? prev : durations[1] ?? durations[0] ?? 2,
      );
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

  async function onCreateGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = guestLabel.trim();
    if (!label) return;
    setSubmitting(true);
    try {
      await createMyGuestPass({
        subject_label: label,
        duration_hours: durationHours,
      });
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
        short guest codes for visitors — one entry, don’t share. Show the code
        at the estate gate.
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
            Single entry · expires in up to {guestMaxHours}h ·{" "}
            {guestActiveCount}/{guestMaxActive} active.
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
          <fieldset className="form-field" disabled={submitting || atGuestCap}>
            <legend className="form-label">Valid for</legend>
            <div className="access-duration-chips" role="group">
              {guestDurations.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="btn-secondary access-duration-chip"
                  data-active={durationHours === h ? "true" : undefined}
                  aria-pressed={durationHours === h}
                  onClick={() => setDurationHours(h)}
                >
                  {h}h
                </button>
              ))}
            </div>
          </fieldset>
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
          ) : (
            <p className="form-hint">
              One entry only — don’t forward the code. Gate admission tracking
              comes later; revoke if it leaks.
            </p>
          )}
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
            const usesLabel =
              row.max_uses != null
                ? ` · ${row.uses_count ?? 0}/${row.max_uses} entries`
                : "";
            return (
              <li key={row.id} className="tenant-notice-card">
                <p className="form-kicker" style={{ marginBottom: 4 }}>
                  {kind}
                  {canRevoke && guestMaxUses === 1 ? " · single entry" : ""}
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
                  {usesLabel}
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
