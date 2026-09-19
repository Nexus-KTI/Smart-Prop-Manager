"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  fetchMyPublications,
  fetchMyTasks,
  fetchUrgentActionsSummary,
} from "@/lib/api";
import { onDataInvalidated } from "@/lib/data-invalidation";
import {
  formatUnreadBadge,
  useMessageUnreadCount,
} from "@/lib/use-message-unread";

export type NotificationsAudience = "landlord" | "tenant";

type NoticeItem = {
  id: string;
  label: string;
  detail: string;
  href: string;
  count?: number;
};

export function NotificationsBell({
  audience,
}: {
  audience: NotificationsAudience;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [extraItems, setExtraItems] = useState<NoticeItem[]>([]);
  const messageUnread = useMessageUnreadCount();

  const loadExtras = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setLoading(true);
    try {
      const next: NoticeItem[] = [];

      if (audience === "landlord") {
        try {
          const summary = await fetchUrgentActionsSummary();
          if (summary.overdue > 0) {
            next.push({
              id: "chase",
              label: "Overdue to chase",
              detail:
                summary.overdue === 1
                  ? "1 unit is past due - open Action needed"
                  : `${summary.overdue} units are past due - open Action needed`,
              href: "/reminders?filter=overdue",
              count: summary.overdue,
            });
          }
          if (summary.lease_ending > 0) {
            next.push({
              id: "leases",
              label: "Leases ending soon",
              detail:
                summary.lease_ending === 1
                  ? "1 lease ends within 60 days"
                  : `${summary.lease_ending} leases end within 60 days`,
              href: "/reminders?filter=ending_soon",
              count: summary.lease_ending,
            });
          }
          if (summary.failed > 0) {
            next.push({
              id: "failed",
              label: "Failed sends",
              detail:
                summary.failed === 1
                  ? "1 chase failed - retry on Action needed"
                  : `${summary.failed} chases failed - retry on Action needed`,
              href: "/reminders?filter=failed",
              count: summary.failed,
            });
          }
        } catch {
          /* actions load failed, skip */
        }
      } else {
        try {
          const pubs = await fetchMyPublications();
          if (pubs.unread_count > 0) {
            next.push({
              id: "notices",
              label: "Unread notices",
              detail:
                pubs.unread_count === 1
                  ? "1 bulletin from your landlord"
                  : `${pubs.unread_count} bulletins from your landlord`,
              href: "/tenant/notices",
              count: pubs.unread_count,
            });
          }
        } catch {
          /* ignore */
        }
        try {
          const tasks = await fetchMyTasks();
          const openTasks = tasks.filter((t) => {
            const s = (t.status || "").toLowerCase();
            return s !== "done" && s !== "canceled" && s !== "cancelled";
          }).length;
          if (openTasks > 0) {
            next.push({
              id: "tasks",
              label: "Open to-dos",
              detail:
                openTasks === 1
                  ? "1 to-do waiting on you"
                  : `${openTasks} to-dos waiting on you`,
              href: "/tenant/tasks",
              count: openTasks,
            });
          }
        } catch {
          /* ignore */
        }
      }

      setExtraItems(next);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadExtras(), 0);
    const id = window.setInterval(() => void loadExtras({ quiet: true }), 60_000);
    const refresh = () => void loadExtras({ quiet: true });
    const stopInvalidation = onDataInvalidated(
      audience === "landlord" ? "urgent-actions" : "notification-extras",
      refresh,
    );
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(id);
      stopInvalidation();
    };
  }, [audience, loadExtras]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items: NoticeItem[] = [];
  if (messageUnread > 0) {
    items.push({
      id: "messages",
      label: "Unread messages",
      detail:
        messageUnread === 1
          ? "1 conversation needs a reply"
          : `${messageUnread} conversations need a reply`,
      href: audience === "tenant" ? "/tenant/messages" : "/messages",
      count: messageUnread,
    });
  }
  items.push(...extraItems);

  // Landlord: Action needed rail owns chase urgency counts. Header badge is
  // only for interrupts the rail does not own (unread messages). Tenant keeps
  // a combined badge (no Action needed rail).
  const badgeTotal =
    audience === "landlord" ? messageUnread : items.reduce((sum, item) => sum + (item.count ?? 1), 0);
  const badge = formatUnreadBadge(badgeTotal);
  const hasMenuItems = items.length > 0;

  return (
    <div className="shell-notifications" ref={rootRef}>
      <button
        type="button"
        className="shell-topbar-icon-btn shell-notifications-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={
          audience === "landlord"
            ? badgeTotal > 0
              ? `Notifications, ${badgeTotal} unread messages`
              : hasMenuItems
                ? "Notifications, open for chase summary"
                : "Notifications"
            : badgeTotal > 0
              ? `Notifications, ${badgeTotal} unread`
              : "Notifications"
        }
        title="Notifications"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) void loadExtras();
        }}
      >
        <Bell size={20} strokeWidth={1.75} aria-hidden />
        {badge ? (
          <span className="shell-notifications-badge" aria-hidden>
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="shell-notifications-panel"
          id={menuId}
          role="menu"
          aria-label="Notifications"
        >
          <div className="shell-notifications-head">
            <p className="shell-notifications-title">Needs attention</p>
            {audience === "landlord" ? (
              <p className="shell-notifications-hint table-muted">
                Clears when you chase or reply in Messages — not mark as read.
              </p>
            ) : (
              <p className="shell-notifications-hint table-muted">
                Opens clear when you read notices or finish to-dos.
              </p>
            )}
          </div>

          {loading && items.length === 0 ? (
            <p className="shell-notifications-empty table-muted">Loading…</p>
          ) : null}

          {!loading && items.length === 0 ? (
            <p className="shell-notifications-empty table-muted">
              {audience === "landlord"
                ? "Nothing to chase or reply to right now."
                : "You’re caught up."}
            </p>
          ) : null}

          <ul className="shell-notifications-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="shell-notifications-item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <span className="shell-notifications-item-label">
                    {item.label}
                    {item.count && item.count > 1 ? (
                      <span className="shell-notifications-item-count">
                        {item.count}
                      </span>
                    ) : null}
                  </span>
                  <span className="shell-notifications-item-detail">
                    {item.detail}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="shell-notifications-foot">
            {audience === "landlord" ? (
              <>
                <Link
                  href="/messages"
                  className="shell-notifications-link"
                  onClick={() => setOpen(false)}
                >
                  Messages
                </Link>
                <Link
                  href="/reminders?filter=urgent"
                  className="shell-notifications-link"
                  onClick={() => setOpen(false)}
                >
                  Action needed
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/tenant/messages"
                  className="shell-notifications-link"
                  onClick={() => setOpen(false)}
                >
                  Messages
                </Link>
                <Link
                  href="/tenant/notices"
                  className="shell-notifications-link"
                  onClick={() => setOpen(false)}
                >
                  Notices
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
