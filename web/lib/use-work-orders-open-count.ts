"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchWorkOrdersOpenCount } from "@/lib/api";
import { onDataInvalidated } from "@/lib/data-invalidation";

/** Open work orders (new + in_progress) for Work orders rail badge. */
export function useWorkOrdersOpenCount(): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await fetchWorkOrdersOpenCount());
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
    const stopInvalidation = onDataInvalidated("work-orders", onFocus);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener("focus", onFocus);
      stopInvalidation();
    };
  }, [refresh]);

  return count;
}
