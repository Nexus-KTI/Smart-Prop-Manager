"use client";

import { FileText, Image as ImageIcon, Mic, Square } from "lucide-react";
import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";

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
  sendThreadMedia,
  sendThreadMessage,
  type ChatMessage,
  type MessageContact,
  type MessageThread,
  type Publication,
} from "@/lib/api";
import { AttemptKey } from "@/lib/attemptKey";
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

type PendingMedia = {
  file: File;
  kind: "image" | "video" | "audio" | "document";
  previewUrl?: string;
  durationMs?: number;
};

const PHOTO_LIMIT = 8 * 1024 * 1024;
const DOCUMENT_LIMIT = 8 * 1024 * 1024;
const VIDEO_LIMIT = 25 * 1024 * 1024;
const MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov";
const DOCUMENT_ACCEPT =
  "application/pdf,.pdf,application/msword,.doc,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const VOICE_LIMIT_MS = 3 * 60 * 1000;

function mediaLabel(kind?: string | null): string {
  if (kind === "image") return "Photo";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Voice note";
  if (kind === "document") return "Document";
  return "";
}

function threadPreview(body: string, kind?: string | null): string {
  const label = mediaLabel(kind);
  const caption = body.trim();
  const text = label ? (caption ? `${label}: ${caption}` : label) : caption;
  return text.length <= 140 ? text : `${text.slice(0, 137)}…`;
}

function formatClock(ms?: number | null): string {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function kindFromFile(file: File): "image" | "video" | "audio" | "document" | null {
  const mime = (file.type || "").split(";")[0].toLowerCase();
  if (
    mime === "application/pdf" ||
    mime === "application/msword" ||
    mime.includes("wordprocessingml")
  ) {
    return "document";
  }
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const name = file.name.toLowerCase();
  if (/\.(pdf|docx?)$/.test(name)) return "document";
  if (/\.(jpe?g|png|webp|gif)$/.test(name)) return "image";
  if (/\.(mp4|mov|webm)$/.test(name)) return "video";
  if (/\.(mp3|wav|m4a|ogg)$/.test(name)) return "audio";
  return null;
}

function asChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    sender_id: String(row.sender_id),
    body: String(row.body || ""),
    created_at: String(row.created_at || new Date().toISOString()),
    kind: (row.kind as ChatMessage["kind"]) || "user",
    meta: (row.meta as ChatMessage["meta"]) ?? null,
    media_kind: (row.media_kind as ChatMessage["media_kind"]) ?? null,
    media_url: row.media_url ? String(row.media_url) : null,
    media_mime: row.media_mime ? String(row.media_mime) : null,
    media_name: row.media_name ? String(row.media_name) : null,
    media_bytes: typeof row.media_bytes === "number" ? row.media_bytes : null,
    media_duration_ms:
      typeof row.media_duration_ms === "number" ? row.media_duration_ms : null,
  };
}

export function MessagesHubClient({ audience }: Props) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("chat");
  const [meId, setMeId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [threadsCapped, setThreadsCapped] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [sendKey] = useState(() => new AttemptKey());
  const [error, setError] = useState<string | null>(null);
  const [pubOpen, setPubOpen] = useState(false);
  const [pending, setPending] = useState<PendingMedia | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const activeIdRef = useRef<string | null>(null);
  const meIdRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickKindRef = useRef<"media" | "document">("media");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const loadMessagesRef = useRef<
    (threadId: string, opts?: { quiet?: boolean }) => Promise<void>
  >(async () => undefined);

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
          const pubs = await fetchPublications();
          setPubs(pubs.items);
        } else {
          const data = await fetchMyPublications();
          setPubs(data.items);
        }
        setThreads([]);
        setThreadsCapped(false);
        setThreadsLoaded(0);
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
        setThreads(t.items);
        setThreadsCapped(t.capped);
        setThreadsLoaded(t.loaded);
        if (t.items.length && !activeId) {
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
        const newestPageStart = data.items[0]?.created_at;
        setMessages((prev) => {
          if (!opts?.quiet || !newestPageStart) return data.items;
          // A live refresh keeps any earlier pages the user already opened.
          const earlier = prev.filter(
            (m) => m.thread_id === threadId && m.created_at < newestPageStart,
          );
          return [...earlier, ...data.items];
        });
        if (!opts?.quiet) setOlderCursor(data.next_before);
        setPeerLastReadAt(data.peer_last_read_at);
        await markThreadRead(threadId);
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, unread: false } : t)),
        );
        emitMessagesRead();
      } catch (err) {
        if (!opts?.quiet) {
          showToast(err instanceof Error ? err.message : "Could not load thread", "error");
        }
      }
    },
    [showToast],
  );

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  async function loadEarlier() {
    if (!activeId || !olderCursor || loadingOlder) return;
    const threadId = activeId;
    setLoadingOlder(true);
    try {
      const data = await fetchThreadMessages(threadId, olderCursor);
      if (activeIdRef.current !== threadId) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...data.items.filter((m) => !seen.has(m.id)), ...prev];
      });
      setOlderCursor(data.next_before);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load earlier messages", "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - recordStartedRef.current;
      setRecordMs(elapsed);
      if (elapsed >= VOICE_LIMIT_MS) {
        const rec = recorderRef.current;
        if (rec && rec.state !== "inactive") rec.stop();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPending(null);
    setOlderCursor(null);
    if (fileRef.current) fileRef.current.value = "";
    const rec = recorderRef.current;
    if (!rec) return;
    rec.onstop = () => {
      rec.stream.getTracks().forEach((track) => track.stop());
    };
    if (rec.state !== "inactive") rec.stop();
    recorderRef.current = null;
    setRecording(false);
    setRecordMs(0);
  }, [activeId]);

  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec) {
        rec.onstop = null;
        if (rec.state !== "inactive") rec.stop();
        rec.stream.getTracks().forEach((track) => track.stop());
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeId && (tab === "chat" || tab === "maintenance")) {
      void loadMessages(activeId);
    }
  }, [activeId, tab, loadMessages]);

  // Live thread previews: only this user's threads (every send updates its thread).
  useEffect(() => {
    if (tab !== "chat" && tab !== "maintenance") return;
    if (!meId) return;

    const onThreadUpdate = (payload: { new: unknown }) => {
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
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`messages-hub:${meId}:${tab}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_threads",
          filter: `landlord_id=eq.${meId}`,
        },
        onThreadUpdate,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_threads",
          filter: `tenant_user_id=eq.${meId}`,
        },
        onThreadUpdate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tab, meId]);

  // Live messages and read receipts for the open thread only.
  useEffect(() => {
    if (tab !== "chat" && tab !== "maintenance") return;
    if (!meId || !activeId) return;

    const onPeerRead = (payload: { new: unknown }) => {
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
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`messages-thread:${meId}:${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${activeId}`,
        },
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
              last_message_preview: threadPreview(msg.body, msg.media_kind),
              unread: isActive ? false : msg.sender_id !== selfId,
            };
            next.sort((a, b) =>
              String(b.last_message_at || "").localeCompare(
                String(a.last_message_at || ""),
              ),
            );
            return next;
          });

          if (msg.media_kind && !msg.media_url) {
            if (currentActive === threadId) {
              void loadMessagesRef.current(threadId, { quiet: true });
            }
            return;
          }

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
        {
          event: "INSERT",
          schema: "public",
          table: "message_thread_reads",
          filter: `thread_id=eq.${activeId}`,
        },
        onPeerRead,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_thread_reads",
          filter: `thread_id=eq.${activeId}`,
        },
        onPeerRead,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tab, meId, activeId]);

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
      showToast(err instanceof Error ? err.message : "Could not open chat", "error");
    }
  }

  function clearPending() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPending(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function openPicker(kind: "media" | "document") {
    const input = fileRef.current;
    if (!input) return;
    pickKindRef.current = kind;
    input.accept = kind === "document" ? DOCUMENT_ACCEPT : MEDIA_ACCEPT;
    input.click();
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const wantDocument = pickKindRef.current === "document";
    const kind = kindFromFile(file);
    if (wantDocument) {
      if (kind !== "document") {
        showToast("Use a PDF or Word document", "error");
        return;
      }
      if (file.size > DOCUMENT_LIMIT) {
        showToast("Documents must be 8 MB or smaller", "error");
        return;
      }
    } else if (!kind || kind === "audio" || kind === "document") {
      showToast("Use a photo or video", "error");
      return;
    } else if (file.size > (kind === "image" ? PHOTO_LIMIT : VIDEO_LIMIT)) {
      showToast(
        kind === "image"
          ? "Photos must be 8 MB or smaller"
          : "Videos must be 25 MB or smaller",
        "error",
      );
      return;
    }
    clearPending();
    const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined;
    previewUrlRef.current = previewUrl ?? null;
    setPending({ file, kind: kind || "document", previewUrl });
  }

  async function startRecording() {
    if (sending || recording) return;
    clearPending();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showToast("Voice notes are not available in this browser", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mime = preferred.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blobType = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        const durationMs = Date.now() - recordStartedRef.current;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size < 1) {
          showToast("Voice note was empty", "error");
          return;
        }
        const ext = blobType.includes("mp4") ? "m4a" : blobType.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-note.${ext}`, { type: blobType });
        setPending({ file, kind: "audio", durationMs });
      };
      recorderRef.current = rec;
      recordStartedRef.current = Date.now();
      setRecordMs(0);
      rec.start();
      setRecording(true);
    } catch {
      showToast("Microphone is unavailable", "error");
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") {
      setRecording(false);
      return;
    }
    rec.stop();
  }

  function discardRecording() {
    const rec = recorderRef.current;
    chunksRef.current = [];
    if (rec) {
      rec.onstop = () => {
        rec.stream.getTracks().forEach((track) => track.stop());
      };
      if (rec.state !== "inactive") rec.stop();
      else rec.stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
    }
    setRecording(false);
    setRecordMs(0);
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!activeId || recording) return;
    const text = composer.trim();
    if (!text && !pending) return;
    setSending(true);
    const file = pending?.file;
    const idempotencyKey = sendKey.for(
      `${activeId}|${text}|${file ? `${file.name}:${file.size}:${file.lastModified}` : ""}`,
    );
    try {
      const msg = pending
        ? await sendThreadMedia(activeId, pending.file, {
            caption: text,
            durationMs: pending.durationMs,
            idempotencyKey,
          })
        : await sendThreadMessage(activeId, text, idempotencyKey);
      sendKey.settle();
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setComposer("");
      clearPending();
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? {
                ...t,
                last_message_at: msg.created_at,
                last_message_preview: threadPreview(msg.body, msg.media_kind),
                unread: false,
              }
            : t,
        ),
      );
    } catch (err) {
      sendKey.settle(err);
      showToast(err instanceof Error ? err.message : "Send failed", "error");
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
      showToast(err instanceof Error ? err.message : "Publish failed", "error");
    }
  }

  const active = threads.find((t) => t.id === activeId) || null;

  return (
    <section className="dashboard messages-hub">
      <header className="dashboard-header">
        <h1 className="page-title">Messages</h1>
        <p className="page-subtitle">
          Chat with connected {audience === "landlord" ? "tenants" : "landlord"},
          estate bulletin, and maintenance threads.
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
      {threadsCapped && tab !== "publications" && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {threadsLoaded} most recent threads in this tab. Older
          conversations may not appear here.
        </p>
      ) : null}

      {tab === "publications" ? (
        <div className="messages-pub-pane">
          {bulletinManage ? (
            <div className="dashboard-header-actions">
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
          {!loading && pubs.length === 0 && !pubOpen ? (
            <div className="dashboard-empty" role="status">
              <p className="dashboard-empty-title mono-data">No publications yet.</p>
              <p className="dashboard-empty-copy">
                {audience === "tenant"
                  ? "Estate posts from your landlord will show here when they publish."
                  : "Post a building-wide update so tenants see it under Notices."}
              </p>
              {bulletinManage ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setPubOpen(true)}
                >
                  New publication
                </button>
              ) : null}
            </div>
          ) : pubs.length > 0 ? (
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
                              "error",
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
          ) : null}
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
                  {olderCursor ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void loadEarlier()}
                      disabled={loadingOlder}
                    >
                      {loadingOlder ? "Loading…" : "Load earlier messages"}
                    </button>
                  ) : null}
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
                          {m.media_kind === "image" && m.media_url ? (
                            <a href={m.media_url} target="_blank" rel="noreferrer">
                              <img
                                className="messages-media messages-media-image"
                                src={m.media_url}
                                alt={m.body || "Photo"}
                              />
                            </a>
                          ) : null}
                          {m.media_kind === "video" && m.media_url ? (
                            <video
                              className="messages-media"
                              controls
                              preload="metadata"
                              src={m.media_url}
                            />
                          ) : null}
                          {m.media_kind === "document" && m.media_url ? (
                            <a
                              className="table-link messages-doc"
                              href={m.media_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {m.media_name || "Document"}
                            </a>
                          ) : null}
                          {m.media_kind === "audio" && m.media_url ? (
                            <div className="messages-voice">
                              <span>
                                Voice note
                                {m.media_duration_ms
                                  ? ` ${formatClock(m.media_duration_ms)}`
                                  : ""}
                              </span>
                              <audio controls preload="metadata" src={m.media_url} />
                            </div>
                          ) : null}
                          {m.media_kind && !m.media_url ? (
                            <p className="table-muted" style={{ margin: 0 }}>
                              {mediaLabel(m.media_kind)} unavailable
                            </p>
                          ) : null}
                          {m.body ? (
                            <p style={{ margin: m.media_kind ? "8px 0 0" : 0 }}>{m.body}</p>
                          ) : null}
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
                  {recording ? (
                    <div className="messages-pending">
                      <span className="mono-data">Recording {formatClock(recordMs)}</span>
                      <button
                        type="button"
                        className="btn-secondary messages-tool-text"
                        onClick={discardRecording}
                      >
                        Discard
                      </button>
                    </div>
                  ) : pending ? (
                    <div className="messages-pending">
                      {pending.kind === "image" && pending.previewUrl ? (
                        <img
                          className="messages-pending-thumb"
                          src={pending.previewUrl}
                          alt=""
                        />
                      ) : null}
                      <span>
                        {pending.kind === "audio"
                          ? `Voice note ${formatClock(pending.durationMs)}`
                          : pending.kind === "video"
                            ? "Video"
                            : pending.kind === "document"
                              ? pending.file.name
                              : "Photo"}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary messages-tool-text"
                        onClick={clearPending}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                  <input
                    ref={fileRef}
                    className="messages-file"
                    type="file"
                    accept={MEDIA_ACCEPT}
                    onChange={onPickFile}
                  />
                  <button
                    type="button"
                    className="btn-secondary messages-tool"
                    aria-label="Add photo or video"
                    disabled={sending || recording}
                    onClick={() => openPicker("media")}
                  >
                    <ImageIcon size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary messages-tool"
                    aria-label="Add document"
                    disabled={sending || recording}
                    onClick={() => openPicker("document")}
                  >
                    <FileText size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn-secondary messages-tool"
                    aria-label={recording ? "Stop voice note" : "Record voice note"}
                    aria-pressed={recording}
                    data-recording={recording ? "true" : undefined}
                    disabled={sending}
                    onClick={recording ? stopRecording : () => void startRecording()}
                  >
                    {recording ? (
                      <Square size={14} aria-hidden="true" />
                    ) : (
                      <Mic size={18} aria-hidden="true" />
                    )}
                  </button>
                  <input
                    className="form-input"
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    placeholder={
                      pending?.kind === "audio" ? "Add a note…" : "Write a message…"
                    }
                    maxLength={4000}
                    disabled={sending || recording}
                  />
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={sending || recording || (!composer.trim() && !pending)}
                  >
                    {sending ? "Sending…" : "Send"}
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
