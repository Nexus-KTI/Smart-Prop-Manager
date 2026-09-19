"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchApplicationsPendingCount } from "@/lib/api";
import { onDataInvalidated } from "@/lib/data-invalidation";

/** Submitted applications awaiting landlord decide — for Applications rail badge. */
export function useApplicationsPendingCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await fetchApplicationsPendingCount());
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
    const stopInvalidation = onDataInvalidated("applications", onFocus);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener("focus", onFocus);
      stopInvalidation();
    };
  }, [refresh]);

  return count;
}
