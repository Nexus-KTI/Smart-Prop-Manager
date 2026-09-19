"use client";

import { useEffect, useState } from "react";

import {
  applySidebarCollapsed,
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "@/lib/sidebar";

const MOBILE_RAIL_MQ = "(max-width: 640px)";

function isMobileRail(): boolean {
  return window.matchMedia(MOBILE_RAIL_MQ).matches;
}

/** Shared rail open/close for product shells (desktop persist + mobile drawer). */
export function useSidebarRail(pathname: string) {
  const [collapsed, setCollapsed] = useState(false);
  const [peekLocked, setPeekLocked] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_RAIL_MQ);
    const sync = () => {
      setMobile(mq.matches);
      setCollapsed(mq.matches ? true : readSidebarCollapsed());
      setReady(true);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applySidebarCollapsed(collapsed);
  }, [collapsed, ready]);

  useEffect(() => {
    // Close the mobile overlay after navigation (topbar toggle is covered while open).
    const id = window.setTimeout(() => {
      if (!isMobileRail()) return;
      setCollapsed(true);
      persistSidebarCollapsed(true);
      setPeekLocked(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  useEffect(() => {
    if (collapsed || !mobile) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setCollapsed(true);
      persistSidebarCollapsed(true);
      setPeekLocked(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, mobile]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    persistSidebarCollapsed(next);
    setPeekLocked(next);
  }

  function closeDrawer() {
    setCollapsed(true);
    persistSidebarCollapsed(true);
    setPeekLocked(true);
  }

  function unlockPeek() {
    setPeekLocked(false);
  }

  return {
    collapsed,
    peekLocked,
    toggleCollapsed,
    closeDrawer,
    unlockPeek,
    drawerOpen: mobile && !collapsed,
  };
}
