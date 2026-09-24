"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AccessPassQr } from "@/components/AccessPassQr";
import { FetchErrorState } from "@/components/FetchErrorState";
import { useToast } from "@/components/ToastProvider";
import {
  createMyGuestPass,
  fetchMyAccessPassEvents,
  fetchMyAccessPasses,
  revokeMyGuestPass,
  type AccessPass,
  type AccessPassEvent,
} from "@/lib/api";

const DEFAULT_DURATIONS = [1, 2, 4, 6] as const;

type ScheduleMode = "now" | "later";
type InviteMode = "visit" | "open";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(): string {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return toLocalInputValue(d);
}

function defaultEnd(startLocal: string, hours: number): string {
  const start = new Date(startLocal);
  if (Number.isNaN(start.getTime())) return startLocal;
  start.setHours(start.getHours() + hours);
  return toLocalInputValue(start);
}

export function TenantAccessClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<AccessPass[]>([]);
  const [gateEvents, setGateEvents] = useState<AccessPassEvent[]>([]);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);
  const [canCreateGuest, setCanCreateGuest] = useState(false);
  const [guestActiveCount, setGuestActiveCount] = useState(0);
  const [guestMaxActive, setGuestMaxActive] = useState(3);
  const [guestOpenActive, setGuestOpenActive] = useState(0);
  const [guestMaxOpen, setGuestMaxOpen] = useState(1);
  const [guestMaxHours, setGuestMaxHours] = useState(6);
  const [guestDurations, setGuestDurations] = useState<number[]>([
    ...DEFAULT_DURATIONS,
  ]);
  const [unitLabel, setUnitLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [guestLabel, setGuestLabel] = useState("");
  const [inviteMode, setInviteMode] = useState<InviteMode>("visit");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("now");
  const [durationHours, setDurationHours] = useState(2);
  const [validFromLocal, setValidFromLocal] = useState(defaultStart);
  const [validUntilLocal, setValidUntilLocal] = useState(() =>
    defaultEnd(defaultStart(), 2),
  );

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
      setGuestOpenActive(data.guest_open_active_count);
      setGuestMaxOpen(data.guest_max_open_active);
      setGuestMaxHours(data.guest_max_hours);
      const durations =
        data.guest_duration_hours?.length > 0
          ? data.guest_duration_hours
          : [...DEFAULT_DURATIONS];
      setGuestDurations(durations);
      setUnitLabel(data.tenancy?.unit_label ?? null);
      setDurationHours((prev) =>
        durations.includes(prev) ? prev : durations[1] ?? durations[0] ?? 2,
      );
      try {
        setGateEvents(await fetchMyAccessPassEvents());
      } catch {
        setGateEvents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usable = useMemo(
    () =>
      items.filter((i) => {
        const s = i.effective_status || i.status;
        return s === "active" || s === "scheduled";
      }),
    [items],
  );

  async function onCreateGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = guestLabel.trim();
    if (!label) return;
    setSubmitting(true);
    try {
      if (scheduleMode === "now") {
        await createMyGuestPass({
          subject_label: label,
          invite_mode: inviteMode,
          duration_hours: durationHours,
        });
      } else {
        const from = new Date(validFromLocal);
        const until = new Date(validUntilLocal);
        if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
          throw new Error("Pick a valid start and end time");
        }
        await createMyGuestPass({
          subject_label: label,
          invite_mode: inviteMode,
          valid_from: from.toISOString(),
          valid_until: until.toISOString(),
        });
      }
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
  const atOpenCap = inviteMode === "open" && guestOpenActive >= guestMaxOpen;
  const formBlocked = submitting || atGuestCap || atOpenCap;

  return (
    <section className="dashboard">
      <h1 className="page-title">Gate codes</h1>
      <p className="page-subtitle">
        Your landlord issues the move-in code. After you’re settled, create
        guest codes for visitors — show the digits or QR at the estate gate
        (works for entry and exit).
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
            Window up to {guestMaxHours}h · {guestActiveCount}/{guestMaxActive}{" "}
            active
            {inviteMode === "open"
              ? ` · open ${guestOpenActive}/${guestMaxOpen}`
              : ""}
            .
          </p>

          <fieldset className="form-field" disabled={formBlocked}>
            <legend className="form-label">Invite type</legend>
            <div className="access-duration-chips" role="group">
              <button
                type="button"
                className="btn-secondary access-duration-chip"
                data-active={inviteMode === "visit" ? "true" : undefined}
                aria-pressed={inviteMode === "visit"}
                onClick={() => setInviteMode("visit")}
              >
                Visit
              </button>
              <button
                type="button"
                className="btn-secondary access-duration-chip"
                data-active={inviteMode === "open" ? "true" : undefined}
                aria-pressed={inviteMode === "open"}
                onClick={() => setInviteMode("open")}
              >
                Open
              </button>
            </div>
            <p className="form-hint" style={{ marginTop: 8 }}>
              {inviteMode === "visit"
                ? "One named guest for a set window — in and out OK."
                : "Reusable in the window (helper / same guest multiple trips). Max one open code."}
            </p>
          </fieldset>

          <label className="form-field">
            <span className="form-label">
              {inviteMode === "visit" ? "Guest name" : "Label"}
            </span>
            <input
              className="form-input"
              value={guestLabel}
              onChange={(e) => setGuestLabel(e.target.value)}
              placeholder={
                inviteMode === "visit" ? "e.g. Mama visiting" : "e.g. Driver today"
              }
              required
              disabled={formBlocked}
              maxLength={120}
            />
          </label>

          <fieldset className="form-field" disabled={formBlocked}>
            <legend className="form-label">When</legend>
            <div className="access-duration-chips" role="group">
              <button
                type="button"
                className="btn-secondary access-duration-chip"
                data-active={scheduleMode === "now" ? "true" : undefined}
                aria-pressed={scheduleMode === "now"}
                onClick={() => setScheduleMode("now")}
              >
                Starts now
              </button>
              <button
                type="button"
                className="btn-secondary access-duration-chip"
                data-active={scheduleMode === "later" ? "true" : undefined}
                aria-pressed={scheduleMode === "later"}
                onClick={() => {
                  setScheduleMode("later");
                  const start = defaultStart();
                  setValidFromLocal(start);
                  setValidUntilLocal(defaultEnd(start, durationHours));
                }}
              >
                Pick date & time
              </button>
            </div>
          </fieldset>

          {scheduleMode === "now" ? (
            <fieldset className="form-field" disabled={formBlocked}>
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
          ) : (
            <>
              <label className="form-field">
                <span className="form-label">Starts</span>
                <input
                  className="form-input mono-data"
                  type="datetime-local"
                  value={validFromLocal}
                  onChange={(e) => {
                    const next = e.target.value;
                    setValidFromLocal(next);
                    setValidUntilLocal(defaultEnd(next, durationHours));
                  }}
                  required
                  disabled={formBlocked}
                />
              </label>
              <label className="form-field">
                <span className="form-label">Ends</span>
                <input
                  className="form-input mono-data"
                  type="datetime-local"
                  value={validUntilLocal}
                  onChange={(e) => setValidUntilLocal(e.target.value)}
                  required
                  disabled={formBlocked}
                />
              </label>
              <p className="form-hint">
                Max {guestMaxHours} hours between start and end. Code stays
                inactive until start.
              </p>
            </>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={formBlocked || !guestLabel.trim()}
            >
              {submitting ? "Creating…" : "Create guest code"}
            </button>
          </div>
          {atGuestCap ? (
            <p className="form-hint" role="status">
              Revoke an active guest code before creating another.
            </p>
          ) : atOpenCap ? (
            <p className="form-hint" role="status">
              Revoke your open code before creating another open invite.
            </p>
          ) : (
            <p className="form-hint">
              Don’t forward the code. Revoke if it leaks. You’ll see gate admits
              for your codes below.
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

      {usable.length === 0 ? (
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
          {usable.map((row) => {
            const canRevoke = row.source_type === "tenant_self";
            const status = row.effective_status || row.status;
            const modeLabel =
              row.invite_mode === "open"
                ? "Open"
                : row.invite_mode === "visit"
                  ? "Visit"
                  : null;
            const kind =
              row.subject_type === "tenant"
                ? "Move-in / resident"
                : row.subject_type === "guest"
                  ? modeLabel
                    ? `Guest · ${modeLabel}`
                    : "Guest"
                  : row.subject_type;
            return (
              <li key={row.id} className="tenant-notice-card">
                <p className="form-kicker" style={{ marginBottom: 4 }}>
                  {kind}
                  {status === "scheduled" ? " · scheduled" : ""}
                </p>
                <h2 className="tenant-notice-title">{row.subject_label}</h2>
                <div className="access-pass-code-row">
                  <p
                    className="stat-value mono-data"
                    style={{ fontSize: "1.5rem", margin: 0 }}
                  >
                    {row.code}
                  </p>
                  {row.subject_type === "guest" ? (
                    <AccessPassQr code={row.code} passId={row.id} />
                  ) : null}
                </div>
                <p className="table-muted">
                  {new Date(row.valid_from).toLocaleString()} →{" "}
                  {new Date(row.valid_until).toLocaleString()}
                </p>
                {row.last_admitted_by_label || row.last_admitted_at ? (
                  <p className="table-muted" style={{ margin: "6px 0 0" }}>
                    Last at gate: {row.last_admitted_by_label || "—"}
                    {row.last_admitted_at
                      ? ` · ${new Date(row.last_admitted_at).toLocaleString()}`
                      : ""}
                  </p>
                ) : null}
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

      {gateEvents.length > 0 ? (
        <div style={{ marginTop: 28, maxWidth: 480 }}>
          <p className="form-kicker">Your guests at the gate</p>
          <p className="form-hint" style={{ marginBottom: 10 }}>
            When your guest codes are used, revoked, or created — issuer trail
            for your invites only.
          </p>
          <ul className="tenant-notice-list">
            {gateEvents.map((ev) => {
              const verb =
                ev.event_type === "created"
                  ? "Issued"
                  : ev.event_type === "admitted"
                    ? "Admitted"
                    : ev.event_type === "revoked"
                      ? "Revoked"
                      : ev.event_type;
              const issuer =
                ev.issuer_label ||
                (typeof ev.metadata?.created_by_label === "string"
                  ? ev.metadata.created_by_label
                  : null);
              return (
                <li key={ev.id} className="tenant-notice-card">
                  <p className="form-kicker" style={{ marginBottom: 4 }}>
                    {verb}
                    {ev.actor_role ? ` · ${ev.actor_role}` : ""}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>{ev.subject_label || "Guest"}</strong>
                    {ev.code ? (
                      <>
                        {" · "}
                        <span className="mono-data">{ev.code}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="table-muted" style={{ margin: "6px 0 0" }}>
                    Issued by {issuer || "you"}
                    {" · "}
                    Actor {ev.actor_label || "—"}
                  </p>
                  <p className="table-muted" style={{ margin: "4px 0 0" }}>
                    {new Date(ev.created_at).toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <p style={{ marginTop: 16 }}>
        <Link href="/tenant" className="table-link">
          Back to home
        </Link>
      </p>
    </section>
  );
}
