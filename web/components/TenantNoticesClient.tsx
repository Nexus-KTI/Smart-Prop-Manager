"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  fetchMyPublications,
  fetchMyTenancy,
  markPublicationRead,
  type Publication,
  type Tenancy,
} from "@/lib/api";

const READ_KEY = "nexora-tenant-notices-read";

type Notice = {
  id: string;
  title: string;
  body: string;
  href?: string;
  cta?: string;
};

function loadReadIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function buildNotices(tenancy: Tenancy | null): Notice[] {
  const items: Notice[] = [
    {
      id: "welcome",
      title: "Welcome to Nexora",
      body: "Claim your landlord invite, then pay rent and download receipts from one place.",
      href: "/tenant/claim",
      cta: "Claim invite",
    },
  ];

  if (!tenancy) {
    items.push({
      id: "connect-landlord",
      title: "Connect your landlord",
      body: "Invite them from Settings, or ask them to send a Nexora claim link from unit Payments.",
      href: "/tenant/settings",
      cta: "Invite landlord",
    });
    return items;
  }

  if (tenancy.status !== "active") {
    items.push({
      id: "await-activate",
      title: "Waiting on activation",
      body: "You’re linked. Your landlord still needs to activate occupancy before pay unlocks.",
      href: "/tenant",
      cta: "Back to home",
    });
    return items;
  }

  items.push({
    id: "pay-online",
    title: "Pay online",
    body: "Your unit is active. Check amount due on Home and pay with Paystack when ready.",
    href: "/tenant",
    cta: "See rent",
  });
  items.push({
    id: "receipts",
    title: "Receipts",
    body: "Paid history shows under Receipts, same ledger your landlord sees.",
    href: "/tenant/receipts",
    cta: "Open receipts",
  });
  items.push({
    id: "utilities",
    title: "Utilities setup",
    body: "Open Utilities to see providers your landlord published, or the wait banner if none yet.",
    href: "/tenant/utilities",
    cta: "Open utilities",
  });
  items.push({
    id: "access",
    title: "Gate codes",
    body: "When your landlord issues an access pass linked to you, it shows under Access.",
    href: "/tenant/access",
    cta: "Open access",
  });
  items.push({
    id: "requests",
    title: "Repair requests",
    body: "Submit a repair from Requests. Your landlord triages it and can assign an artisan.",
    href: "/tenant/requests",
    cta: "Open requests",
  });
  return items;
}

export function TenantNoticesClient() {
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [unreadPubs, setUnreadPubs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, bulletin] = await Promise.all([
        fetchMyTenancy(),
        fetchMyPublications().catch(() => ({ items: [] as Publication[], unread_count: 0 })),
      ]);
      setTenancy(t);
      setPubs(bulletin.items);
      setUnreadPubs(bulletin.unread_count);
      setReadIds(loadReadIds());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const notices = useMemo(() => buildNotices(tenancy), [tenancy]);
  const visible = unreadOnly
    ? notices.filter((n) => !readIds.has(n.id))
    : notices;
  const visiblePubs = unreadOnly ? pubs.filter((p) => !p.is_read) : pubs;

  function markRead(id: string) {
    const next = new Set(readIds);
    next.add(id);
    setReadIds(next);
    writeIds(next);
  }

  function markAllRead() {
    const next = new Set(notices.map((n) => n.id));
    setReadIds(next);
    writeIds(next);
    void Promise.all(pubs.filter((p) => !p.is_read).map((p) => markPublicationRead(p.id)))
      .then(() => load())
      .catch(() => undefined);
  }

  if (loading) return <p className="page-subtitle">Loading notices…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load notices"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Notices</h1>
          <p className="page-subtitle">
            Landlord bulletin
            {unreadPubs ? ` · ${unreadPubs} unread` : ""} plus getting-started tips.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <label className="table-muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
          <button type="button" className="btn-secondary" onClick={markAllRead}>
            Mark all read
          </button>
        </div>
      </header>

      {visiblePubs.length > 0 ? (
        <>
          <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
            From your landlord
          </h2>
          <ul className="tenant-notice-list">
            {visiblePubs.map((pub) => {
              const unread = !pub.is_read;
              return (
                <li
                  key={pub.id}
                  className="tenant-notice-card"
                  data-unread={unread ? "true" : undefined}
                >
                  <div className="tenant-notice-card-head">
                    <h2 className="tenant-notice-title">{pub.title}</h2>
                    {unread ? <span className="tenant-notice-dot" aria-label="Unread" /> : null}
                  </div>
                  <p className="page-subtitle" style={{ margin: 0 }}>
                    {pub.body}
                  </p>
                  {unread ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        void markPublicationRead(pub.id)
                          .then(load)
                          .catch(() => undefined)
                      }
                    >
                      Mark read
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
        Tips
      </h2>
      <ul className="tenant-notice-list">
        {visible.length === 0 ? (
          <li className="table-muted">No unread notices.</li>
        ) : (
          visible.map((notice) => {
            const unread = !readIds.has(notice.id);
            return (
              <li
                key={notice.id}
                className="tenant-notice-card"
                data-unread={unread ? "true" : undefined}
              >
                <div className="tenant-notice-card-head">
                  <h2 className="tenant-notice-title">{notice.title}</h2>
                  {unread ? <span className="tenant-notice-dot" aria-label="Unread" /> : null}
                </div>
                <p className="page-subtitle" style={{ margin: 0 }}>
                  {notice.body}
                </p>
                <div className="dashboard-header-actions">
                  {notice.href && notice.cta ? (
                    <Link
                      href={notice.href}
                      className="btn-primary"
                      onClick={() => markRead(notice.id)}
                    >
                      {notice.cta}
                    </Link>
                  ) : null}
                  {unread ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => markRead(notice.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
