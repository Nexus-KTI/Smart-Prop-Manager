"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchUrgentActionsSummary } from "@/lib/api";
import { onDataInvalidated } from "@/lib/data-invalidation";

/**
 * Action needed `summary.urgent` for the Action needed rail badge.
 * Refreshes on mount and window focus.
 */
export function useUrgentActionsCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const summary = await fetchUrgentActionsSummary();
      setCount(summary.urgent);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void refresh(), 0);

    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    const stopInvalidation = onDataInvalidated("urgent-actions", onFocus);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener("focus", onFocus);
      stopInvalidation();
    };
  }, [refresh]);

  return count;
}
