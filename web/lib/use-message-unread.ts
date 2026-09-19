"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchMessageUnreadCount } from "@/lib/api";
import { onDataInvalidated } from "@/lib/data-invalidation";
import { createClient } from "@/lib/supabase/client";

/** Fired when the local client marks a thread read so shell badges clear immediately. */
export const MESSAGES_READ_EVENT = "nexora:messages-read";

export function emitMessagesRead(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
}

export function formatUnreadBadge(n: number): string {
  if (n <= 0) return "";
  if (n > 9) return "9+";
  return String(n);
}

/**
 * Live unread conversation count for shell nav / bell.
 * Refreshes on focus, local read events, and Supabase Realtime.
 */
export function useMessageUnreadCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const n = await fetchMessageUnreadCount().catch(() => 0);
    setCount(n);
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);

    let debounceTimer: number | null = null;
    const schedule = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void refresh();
      }, 350);
    };

    const supabase = createClient();
    // React Strict Mode can mount the effect twice within the same millisecond.
    // A timestamp can then reuse a still-subscribed channel and Supabase rejects
    // the second set of postgres_changes callbacks.
    const channelName = `shell-message-unread:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_thread_reads" },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "message_threads" },
        schedule,
      )
      .subscribe();

    function onFocus() {
      void refresh();
    }
    function onLocalRead() {
      void refresh();
    }

    window.addEventListener("focus", onFocus);
    window.addEventListener(MESSAGES_READ_EVENT, onLocalRead);
    const stopInvalidation = onDataInvalidated("message-unread", onLocalRead);

    return () => {
      window.clearTimeout(initialTimer);
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(MESSAGES_READ_EVENT, onLocalRead);
      stopInvalidation();
    };
  }, [refresh]);

  return count;
}
