"use client";

export type NotifyMatrixChannel = "email" | "sms" | "whatsapp" | "feed";

export type NotifyAudience = "landlord" | "tenant";

export type NotificationPrefs = Record<
  string,
  Record<NotifyMatrixChannel, boolean>
>;

export const TENANT_NOTIFY_EVENTS: {
  id: string;
  label: string;
  hint: string;
}[] = [
  {
    id: "rent_due",
    label: "Rent due / reminders",
    hint: "Upcoming and overdue rent notices",
  },
  {
    id: "payment_receipt",
    label: "Payment receipts",
    hint: "When rent or other charges are recorded",
  },
  {
    id: "maintenance_update",
    label: "Repair updates",
    hint: "Status changes on your repair requests",
  },
  {
    id: "messages",
    label: "Messages",
    hint: "New chat or maintenance thread activity",
  },
  {
    id: "lease_docs",
    label: "Lease documents",
    hint: "New docs shared for your tenancy",
  },
];

/** Landlord in-app prefs — outbound rent chase uses each tenant’s rent_due row. */
export const LANDLORD_NOTIFY_EVENTS: {
  id: string;
  label: string;
  hint: string;
}[] = [
  {
    id: "payment_receipt",
    label: "Payment receipts",
    hint: "When rent or other charges are recorded on your units",
  },
  {
    id: "messages",
    label: "Messages",
    hint: "New chat or maintenance thread activity",
  },
];

/** All events stored in profiles.notification_prefs (union). */
export const NOTIFY_EVENT_LABELS = TENANT_NOTIFY_EVENTS;

export const NOTIFY_CHANNELS: { id: NotifyMatrixChannel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "sms", label: "SMS" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "feed", label: "In-app" },
];

export function defaultNotificationPrefs(): NotificationPrefs {
  const prefs: NotificationPrefs = {};
  for (const event of NOTIFY_EVENT_LABELS) {
    prefs[event.id] = {
      email: true,
      sms: true,
      whatsapp: true,
      feed: true,
    };
  }
  return prefs;
}

export function normalizeNotificationPrefs(
  raw: unknown,
): NotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const event of NOTIFY_EVENT_LABELS) {
    const row = obj[event.id];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    for (const ch of NOTIFY_CHANNELS) {
      if (typeof r[ch.id] === "boolean") {
        base[event.id][ch.id] = r[ch.id] as boolean;
      }
    }
  }
  return base;
}

type Props = {
  prefs: NotificationPrefs;
  disabled?: boolean;
  audience?: NotifyAudience;
  onChange: (next: NotificationPrefs) => void;
};

export function NotificationPrefsMatrix({
  prefs,
  disabled,
  audience = "tenant",
  onChange,
}: Props) {
  const events =
    audience === "landlord" ? LANDLORD_NOTIFY_EVENTS : TENANT_NOTIFY_EVENTS;

  function toggle(eventId: string, channel: NotifyMatrixChannel) {
    onChange({
      ...prefs,
      [eventId]: {
        ...prefs[eventId],
        [channel]: !prefs[eventId][channel],
      },
    });
  }

  return (
    <div className="settings-notify-matrix-wrap">
      <p className="form-hint">
        {audience === "landlord"
          ? "Events that may reach you when notify is configured. Rent chase notices use each tenant’s own “Rent due / reminders” prefs — not this matrix."
          : "Choose which events may reach you on each channel. Prefs don’t guarantee delivery — your preferred channel is tried first when notify is configured."}
      </p>
      <div className="data-table-wrap settings-notify-matrix">
        <table className="data-table">
          <thead>
            <tr>
              <th>Event</th>
              {NOTIFY_CHANNELS.map((ch) => (
                <th key={ch.id} className="settings-notify-ch">
                  {ch.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <span className="settings-pref-title">{event.label}</span>
                  <span className="settings-pref-desc">{event.hint}</span>
                </td>
                {NOTIFY_CHANNELS.map((ch) => (
                  <td key={ch.id} className="settings-notify-ch">
                    <input
                      type="checkbox"
                      checked={Boolean(prefs[event.id]?.[ch.id])}
                      disabled={disabled}
                      aria-label={`${event.label} via ${ch.label}`}
                      onChange={() => toggle(event.id, ch.id)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
