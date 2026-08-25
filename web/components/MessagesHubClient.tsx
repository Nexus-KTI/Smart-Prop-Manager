"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  archivePublication,
  createPublication,
  fetchMe,
  fetchMessageContacts,
  fetchMessageThreads,
  fetchMyPublications,
  fetchPublications,
  fetchThreadMessages,
  markPublicationRead,
  markThreadRead,
  openChatThread,
  openMaintenanceThread,
  sendThreadMessage,
  type ChatMessage,
  type MessageContact,
  type MessageThread,
  type Publication,
} from "@/lib/api";
import {
  PAYMENT_STATUS_LABELS,
  labelOrTitle,
  messageReceiptLabel,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { emitMessagesRead } from "@/lib/use-message-unread";

type Tab = "chat" | "publications" | "maintenance";

type Props = {
  /** Landlord dashboard vs tenant portal copy/links */
  audience: "landlord" | "tenant";
};

function asChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    sender_id: String(row.sender_id),
    body: String(row.body || ""),
    created_at: String(row.created_at || new Date().toISOString()),
    kind: (row.kind as ChatMessage["kind"]) || "user",
    meta: (row.meta as ChatMessage["meta"]) ?? null,
  };
}

export function MessagesHubClient({ audience }: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("chat");
  const [meId, setMeId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const meIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    meIdRef.current = meId;
  }, [meId]);

  const requestsHref =
    audience === "tenant" ? "/tenant/requests" : "/work-orders";
  const bulletinManage = audience === "landlord";

  const loadTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await fetchMe().catch(() => null);
      setMeId(me?.id ?? null);

      if (tab === "publications") {
        if (audience === "landlord") {
          setPubs(await fetchPublications());
        } else {
          const data = await fetchMyPublications();
          setPubs(data.items);
        }
        setThreads([]);
        setActiveId(null);
        setMessages([]);
        setPeerLastReadAt(null);
      } else {
        const kind = tab === "chat" ? "chat" : "maintenance";
        const [c, t] = await Promise.all([
          tab === "chat" ? fetchMessageContacts() : Promise.resolve([]),
          fetchMessageThreads(kind),
        ]);
        setContacts(c);
        setThreads(t);
        if (t.length && !activeId) {
          // keep selection if still present
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages");
    } finally {
      setLoading(false);
    }
  }, [audience, tab, activeId]);

  useEffect(() => {
    void loadTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on tab change only
  }, [tab, audience]);

  const loadMessages = useCallback(
    async (threadId: string, opts?: { quiet?: boolean }) => {
      try {
        const data = await fetchThreadMessages(threadId);
        setMessages(data.items);
        setPeerLastReadAt(data.peer_last_read_at);
        await markThreadRead(threadId);
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t)),
        );
        emitMessagesRead();
      } catch (err) {
        if (!opts?.quiet) {
          showToast(err instanceof Error ? err.message : "Could not load thread");
        }
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (activeId && (tab === "chat" || tab === "maintenance")) {
      void loadMessages(activeId);
    }
  }, [activeId, tab, loadMessages]);

  // Live updates via Supabase Realtime (new messages, thread previews, read receipts).
  useEffect(() => {
    if (tab !== "chat" && tab !== "maintenance") return;
    if (!meId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`messages-hub:${meId}:${tab}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const threadId = String(row.thread_id || "");
          if (!threadId) return;
          const msg = asChatMessage(row);
          const currentActive = activeIdRef.current;
          const selfId = meIdRef.current;

          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.id === threadId);
            if (idx < 0) return prev;
            const next = [...prev];
            const current = next[idx];
            const isActive = currentActive === threadId;
            next[idx] = {
              ...current,
              last_message_at: msg.created_at,
              last_message_preview: msg.body.slice(0, 140),
              unread: isActive ? false : msg.sender_id !== selfId,
            };
            next.sort((a, b) =>
              String(b.last_message_at || "").localeCompare(
                String(a.last_message_at || ""),
              ),
            );
            return next;
          });

          if (currentActive === threadId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
            if (selfId && msg.sender_id !== selfId) {
              void markThreadRead(threadId)
                .then(() => emitMessagesRead())
                .catch(() => undefined);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_threads" },
        (payload) => {
          const row = payload.new as Partial<MessageThread> & { id?: string };
          if (!row.id) return;
          const currentActive = activeIdRef.current;
          setThreads((prev) => {
            const idx = prev.findIndex((t) => t.id === row.id);
            if (idx < 0) return prev;
            const next = [...prev];
            const prior = next[idx];
            next[idx] = {
              ...prior,
              ...row,
              unread:
                currentActive === row.id
                  ? false
                  : prior.unread ||
                    (row.last_message_at != null &&
                      row.last_message_at !== prior.last_message_at),
            };
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_thread_reads",
        },
        (payload) => {
          const row = payload.new as {
            thread_id?: string;
            user_id?: string;
            last_read_at?: string;
          };
          if (!row.thread_id || !row.last_read_at) return;
          if (row.thread_id !== activeIdRef.current) return;
          const selfId = meIdRef.current;
          if (!selfId || row.user_id === selfId) return;
          setPeerLastReadAt(row.last_read_at);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tab, meId]);

  // Slow fallback if Realtime drops (peer read / missed events).
  useEffect(() => {
    if (!activeId || (tab !== "chat" && tab !== "maintenance")) return;
    const id = window.setInterval(() => {
      void loadMessages(activeId, { quiet: true });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [activeId, tab, loadMessages]);

  async function selectThread(thread: MessageThread) {
    setActiveId(thread.id);
  }

  async function startChat(contact: MessageContact) {
    try {
      const thread = await openChatThread(contact.tenancy_id);
      setThreads((prev) => {
        if (prev.some((t) => t.id === thread.id)) return prev;
        return [thread, ...prev];
      });
      setActiveId(thread.id);
      showToast("Chat opened");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not open chat");
    }
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!activeId || !composer.trim()) return;
    setSending(true);
    try {
      const msg = await sendThreadMessage(activeId, composer.trim());
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setComposer("");
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? {
                ...t,
                last_message_at: msg.created_at,
                last_message_preview: msg.body.slice(0, 140),
                unread: false,
              }
            : t,
        ),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function onPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await createPublication({
        title: String(data.get("title") || "").trim(),
        body: String(data.get("body") || "").trim(),
      });
      showToast("Published");
      event.currentTarget.reset();
      setPubOpen(false);
      await loadTab();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Publish failed");
    }
  }

  const active = threads.find((t) => t.id === activeId) || null;

  return (
    <section className="dashboard messages-hub">
      <header className="dashboard-header">
        <h1 className="page-title">Messages</h1>
        <p className="page-subtitle">
          Chat with connected {audience === "landlord" ? "tenants" : "landlord"},
          estate bulletin, and maintenance threads, TenantCloud-style hub.
        </p>
      </header>

      <div className="messages-tabs" role="tablist" aria-label="Message channels">
        {(
          [
            ["chat", "Chat"],
            ["publications", "Publications"],
            ["maintenance", "Maintenance"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="btn-secondary"
            data-active={tab === id ? "true" : undefined}
            onClick={() => {
              setTab(id);
              setActiveId(null);
              setMessages([]);
              setPeerLastReadAt(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="page-subtitle">Loading…</p> : null}

      {tab === "publications" ? (
        <div className="messages-pub-pane">
          {bulletinManage ? (
            <div className="dashboard-header-actions" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setPubOpen((v) => !v)}
              >
                {pubOpen ? "Close" : "New publication"}
              </button>
              <Link href="/publications" className="btn-secondary">
                Full bulletin page
              </Link>
            </div>
          ) : null}
          {pubOpen ? (
            <form className="form-card" onSubmit={onPublish}>
              <label className="form-label">
                Title
                <input name="title" required className="form-input" maxLength={160} />
              </label>
              <label className="form-label">
                Body
                <textarea name="body" required className="form-input" rows={4} />
              </label>
              <button type="submit" className="btn-primary">
                Publish
              </button>
            </form>
          ) : null}
          {!loading && pubs.length === 0 ? (
            <p className="table-muted">
              {audience === "tenant"
                ? "No landlord publications yet. You’ll see estate posts here when they publish."
                : "No publications yet. Post building-wide updates for your tenants."}
            </p>
          ) : (
            <ul className="stack-list">
              {pubs.map((p) => (
                <li key={p.id} className="form-card">
                  <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                    {p.title}
                    {p.is_read === false ? (
                      <span className="tenant-notice-dot" aria-label="Unread" />
                    ) : null}
                  </h2>
                  <p className="page-subtitle">{p.body}</p>
                  {audience === "tenant" && !p.is_read ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        void markPublicationRead(p.id)
                          .then(loadTab)
                          .catch(() => undefined)
                      }
                    >
                      Mark read
                    </button>
                  ) : null}
                  {audience === "landlord" ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        void archivePublication(p.id)
                          .then(loadTab)
                          .catch((err) =>
                            showToast(
                              err instanceof Error ? err.message : "Archive failed",
                            ),
                          )
                      }
                    >
                      Archive
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="messages-split">
          <aside className="messages-sidebar form-card">
            {tab === "chat" ? (
              <>
                <h2 className="page-title" style={{ fontSize: "1rem" }}>
                  Contacts
                </h2>
                {contacts.length === 0 ? (
                  <p className="table-muted">
                    {audience === "tenant"
                      ? "No landlord connection yet. Claim an invite first."
                      : "No linked tenants yet. Invite a tenant and wait for claim."}
                  </p>
                ) : (
                  <ul className="stack-list">
                    {contacts.map((c) => (
                      <li key={c.tenancy_id}>
                        <button
                          type="button"
                          className="table-link"
                          onClick={() => void startChat(c)}
                        >
                          {c.name}
                          {c.unit_label ? ` · ${c.unit_label}` : ""}
                          {c.property_name ? ` · ${c.property_name}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <h2 className="page-title" style={{ fontSize: "1rem", marginTop: 16 }}>
                  Conversations
                </h2>
              </>
            ) : (
              <h2 className="page-title" style={{ fontSize: "1rem" }}>
                Maintenance threads
              </h2>
            )}
            {threads.length === 0 && !loading ? (
              <p className="table-muted">
                {tab === "maintenance" ? (
                  <>
                    No maintenance threads yet.{" "}
                    <Link href={requestsHref} className="table-link">
                      Open requests
                    </Link>
                    . Threads open when a request is created.
                  </>
                ) : (
                  "No conversations yet. Pick a contact to start."
                )}
              </p>
            ) : (
              <ul className="stack-list">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="messages-thread-btn"
                      data-active={activeId === t.id ? "true" : undefined}
                      onClick={() => void selectThread(t)}
                    >
                      <strong>
                        {t.subject || (t.kind === "maintenance" ? "Maintenance" : "Chat")}
                      </strong>
                      {t.unread ? (
                        <span className="tenant-notice-dot" aria-label="Unread" />
                      ) : null}
                      <span className="table-muted">
                        {t.last_message_preview || "No messages yet"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {tab === "maintenance" ? (
              <p className="page-subtitle" style={{ marginTop: 12 }}>
                <Link href={requestsHref} className="table-link">
                  {audience === "tenant" ? "Your requests" : "Work orders"}
                </Link>
              </p>
            ) : null}
          </aside>

          <div className="messages-pane form-card">
            {!active ? (
              <p className="table-muted">
                Select a conversation
                {tab === "maintenance"
                  ? ", or open a request thread from the list."
                  : " or start one from Contacts."}
              </p>
            ) : (
              <>
                <header className="messages-pane-head">
                  <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
                    {active.subject || "Conversation"}
                  </h2>
                  {active.maintenance_request_id ? (
                    <p className="table-muted mono-data">
                      MR {active.maintenance_request_id.slice(0, 8)}…
                      {audience === "landlord" ? (
                        <>
                          {" "}
                          ·{" "}
                          <button
                            type="button"
                            className="table-link"
                            onClick={() =>
                              void openMaintenanceThread(active.maintenance_request_id!)
                                .then((t) => setActiveId(t.id))
                                .catch(() => undefined)
                            }
                          >
                            Refresh thread
                          </button>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </header>
                <div className="messages-stream">
                  {messages.length === 0 ? (
                    <p className="table-muted">No messages yet, say hello.</p>
                  ) : (
                    messages.map((m) => {
                      const isPayment = m.kind === "payment";
                      const mine = Boolean(meId && m.sender_id === meId);
                      const receiptUrl = (m.meta?.receipt_url || "").trim();
                      const hasReceipt = /^https?:\/\//i.test(receiptUrl);
                      const statusLabel = labelOrTitle(
                        PAYMENT_STATUS_LABELS,
                        m.meta?.status || "paid",
                      );

                      if (isPayment) {
                        return (
                          <div
                            key={m.id}
                            className="messages-bubble messages-bubble-payment"
                            data-kind="payment"
                          >
                            <p className="messages-payment-body">{m.body}</p>
                            <div className="messages-payment-meta">
                              <span className="status-badge paid">{statusLabel}</span>
                              <span className="table-muted" style={{ fontSize: "0.8rem" }}>
                                {new Date(m.created_at).toLocaleString()}
                              </span>
                            </div>
                            {hasReceipt ? (
                              <a
                                href={receiptUrl}
                                className="table-link"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open receipt
                              </a>
                            ) : null}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={m.id}
                          className="messages-bubble"
                          data-mine={mine ? "true" : undefined}
                        >
                          <p style={{ margin: 0 }}>{m.body}</p>
                          <span className="messages-bubble-foot table-muted">
                            {new Date(m.created_at).toLocaleString()}
                            {mine && tab === "chat" ? (
                              <>
                                {" · "}
                                {messageReceiptLabel(m.created_at, peerLastReadAt)}
                              </>
                            ) : null}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <form className="messages-composer" onSubmit={onSend}>
                  <input
                    className="form-input"
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    placeholder="Write a message…"
                    maxLength={4000}
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={sending || !composer.trim()}
                  >
                    Send
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
