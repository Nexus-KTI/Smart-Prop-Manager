"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  fetchMyPublications,
  fetchMyTasks,
  fetchOpsOverdue,
} from "@/lib/api";
import { resolveUnitStatus } from "@/lib/dashboard";
import type { Transaction, Unit } from "@/lib/types";
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
          const ops = await fetchOpsOverdue();
          const n = (ops.items ?? []).filter((row) => {
            const unit = {
              ...row.unit,
              transactions: row.transactions,
            } as Unit;
            return (
              resolveUnitStatus(
                unit,
                (row.transactions || []) as Transaction[],
              ) === "OVERDUE"
            );
          }).length;
          if (n > 0) {
            next.push({
              id: "chase",
              label: "Units overdue",
              detail:
                n === 1
                  ? "1 unit is past due on the chase list"
                  : `${n} units are past due on the chase list`,
              href: "/ops",
              count: n,
            });
          }
        } catch {
          /* owner without ops grant, skip */
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
          const openTasks = tasks.filter(
            (t) => t.status !== "done" && t.status !== "cancelled",
          ).length;
          if (openTasks > 0) {
            next.push({
              id: "tasks",
              label: "Open tasks",
              detail:
                openTasks === 1
                  ? "1 task waiting on you"
                  : `${openTasks} tasks waiting on you`,
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
    void loadExtras();
    const id = window.setInterval(() => void loadExtras({ quiet: true }), 60_000);
    return () => window.clearInterval(id);
  }, [loadExtras]);

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

  const total = items.reduce((sum, item) => sum + (item.count ?? 1), 0);
  const badge = formatUnreadBadge(total);

  return (
    <div className="shell-notifications" ref={rootRef}>
      <button
        type="button"
        className="shell-topbar-icon-btn shell-notifications-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={
          total > 0
            ? `Notifications, ${total} unread`
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
          </div>

          {loading && items.length === 0 ? (
            <p className="shell-notifications-empty table-muted">Loading…</p>
          ) : null}

          {!loading && items.length === 0 ? (
            <p className="shell-notifications-empty table-muted">
              You’re caught up.
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
                  href="/ops"
                  className="shell-notifications-link"
                  onClick={() => setOpen(false)}
                >
                  Chase ops
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
