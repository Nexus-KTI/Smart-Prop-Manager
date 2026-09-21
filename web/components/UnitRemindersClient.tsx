"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { useToast } from "@/components/ToastProvider";
import { fetchReminderLogPage, retryReminder, sendReminder } from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";
import {
  CHANNEL_LABELS,
  REMINDER_STATUS_LABELS,
  labelOrTitle,
} from "@/lib/labels";
import type { Reminder } from "@/lib/types";

type Props = {
  unitId: string;
  unitLabel: string;
  propertyName: string;
  rentAmount: number;
  tenantName?: string | null;
  tenantContact?: string | null;
  reminders: Reminder[];
  initialNextCursor?: string | null;
};

function statusTone(status: string): string {
  if (status === "sent") return "paid";
  if (status === "skipped" || status === "queued") return "pending";
  return "overdue";
}

function kindLabel(kind?: string | null): string {
  if (kind === "landlord_payment") return "landlord notice";
  if (kind === "receipt") return "receipt";
  if (kind === "renewal") return "renewal";
  return kind?.trim() || "due";
}

function formatWhen(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function defaultMessage(
  propertyName: string,
  unitLabel: string,
  rentAmount: number,
): string {
  return `Reminder: rent of ${formatNaira(rentAmount)} for ${propertyName} · ${unitLabel} is due. Please pay at your earliest convenience.`;
}

/** Flow E + API: failed (and skipped) rows can be resent via POST /reminders/retry/{id}. */
function canRetry(reminder: Reminder): boolean {
  return reminder.status === "failed" || reminder.status === "skipped";
}

function failureDetail(reminder: Reminder): string | null {
  if (reminder.status !== "failed" && reminder.status !== "skipped") {
    return null;
  }
  const detail = reminder.error_detail?.trim();
  if (detail) return detail;
  if (reminder.status === "failed") return "Send failed.";
  return null;
}

export function UnitRemindersClient({
  unitId,
  unitLabel,
  propertyName,
  rentAmount,
  tenantName,
  tenantContact,
  reminders: initialReminders,
  initialNextCursor = null,
}: Props) {
  const { showToast } = useToast();
  const [reminders, setReminders] = useState(initialReminders);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function refreshLog() {
    const page = await fetchReminderLogPage(unitId);
    setReminders(page.items);
    setNextCursor(page.next_cursor);
  }

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchReminderLogPage(unitId, nextCursor);
      setReminders((current) => [...current, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not load more reminders.",
        "error",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleRetry(reminder: Reminder) {
    if (retryingId || !canRetry(reminder)) return;
    setRetryingId(reminder.id);
    try {
      await retryReminder(reminder.id);
      await refreshLog();
      showToast("Notice retry queued", "success");
    } catch (err) {
      try {
        await refreshLog();
      } catch {
        /* keep prior rows if refresh fails */
      }
      // Keep recovery on the row, toast only, not a full-page empty.
      showToast(
        err instanceof Error ? err.message : "Could not retry notice.",
        "error",
      );
    } finally {
      setRetryingId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const contact = String(form.get("contact") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();

    try {
      if (!contact) throw new Error("Contact is required.");
      if (!message) throw new Error("Message is required.");
      await sendReminder({ unit_id: unitId, contact, message });
      await refreshLog();
      setFormOpen(false);
      showToast("Reminder queued", "success");
    } catch (err) {
      try {
        await refreshLog();
      } catch {
        /* keep prior rows if refresh fails */
      }
      setError(err instanceof Error ? err.message : "Could not send reminder.");
    } finally {
      setPending(false);
    }
  }

  const isEmpty = reminders.length === 0;

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">
            <Link href="/reminders">Action needed</Link>
            {" · "}
            {propertyName} · {unitLabel}
          </p>
          <h1 className="page-title">Reminders</h1>
          <p className="page-subtitle">
            Reminder log, receipts, and landlord notices for this unit
            {tenantName ? ` · ${tenantName}` : ""}.
          </p>
        </div>
        {!isEmpty && !formOpen ? (
          <div className="dashboard-header-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setFormOpen(true)}
            >
              Send Reminder
            </button>
          </div>
        ) : null}
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {formOpen ? (
        <form className="form-card manual-payment-card" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">Contact</span>
            <input
              className="form-input mono-data"
              name="contact"
              type="text"
              required
              defaultValue={tenantContact ?? ""}
              placeholder="+234…"
              autoComplete="tel"
            />
          </label>

          <label className="form-field">
            <span className="form-label">Message</span>
            <textarea
              className="form-input form-textarea"
              name="message"
              required
              rows={4}
              defaultValue={defaultMessage(propertyName, unitLabel, rentAmount)}
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reminder"}
            </button>
          </div>
        </form>
      ) : null}

      {isEmpty && !formOpen ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">Nothing here yet.</p>
          <p className="dashboard-empty-copy">
            Send a rent reminder to start this log.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setFormOpen(true)}
          >
            Send Reminder
          </button>
        </div>
      ) : null}

      {!isEmpty ? (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Sent at</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {reminders.map((reminder) => {
                  const detail = failureDetail(reminder);
                  const isRetrying = retryingId === reminder.id;
                  const retryBusy = retryingId !== null;

                  return (
                    <tr key={reminder.id}>
                      <td className="mono-data">{kindLabel(reminder.kind)}</td>
                      <td className="mono-data">
                        {labelOrTitle(CHANNEL_LABELS, reminder.channel)}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${statusTone(reminder.status)}`}
                        >
                          {labelOrTitle(REMINDER_STATUS_LABELS, reminder.status)}
                        </span>
                        {detail ? (
                          <p className="reminder-error-detail" title={detail}>
                            {detail}
                          </p>
                        ) : null}
                      </td>
                      <td className="mono-data">
                        {formatWhen(reminder.sent_at)}
                      </td>
                      <td className="table-actions">
                        {canRetry(reminder) ? (
                          <button
                            type="button"
                            className="btn-secondary btn-table-cta"
                            disabled={retryBusy}
                            aria-busy={isRetrying}
                            aria-label={`Retry ${kindLabel(reminder.kind)} notice`}
                            onClick={() => handleRetry(reminder)}
                          >
                            {isRetrying ? "Retrying…" : "Retry"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <LoadMoreButton
            hasMore={Boolean(nextCursor)}
            loading={loadingMore}
            onLoadMore={onLoadMore}
          />
        </>
      ) : null}
    </section>
  );
}
