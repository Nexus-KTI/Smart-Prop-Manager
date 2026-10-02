"use client";

import { useEffect, useRef, useState } from "react";

import {
  applySidebarCollapsed,
  persistSidebarCollapsed,
  readSidebarCollapsed,
} from "@/lib/sidebar";

const MOBILE_RAIL_MQ = "(max-width: 640px)";
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isMobileRail(): boolean {
  return window.matchMedia(MOBILE_RAIL_MQ).matches;
}

/** Shared rail open/close for product shells (desktop persist + mobile drawer). */
export function useSidebarRail(pathname: string) {
  const [collapsed, setCollapsed] = useState(false);
  const [peekLocked, setPeekLocked] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [ready, setReady] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawerOpen = mobile && !collapsed;

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
    if (!drawerOpen) return;
    const root = document.documentElement;
    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.setAttribute("data-drawer-open", "true");
    sidebarRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCollapsed(true);
        persistSidebarCollapsed(true);
        setPeekLocked(true);
        return;
      }
      if (e.key !== "Tab" || !sidebarRef.current) return;
      const items = Array.from(
        sidebarRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.removeAttribute("data-drawer-open");
      if (opener?.isConnected) opener.focus();
    };
  }, [drawerOpen]);

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
    drawerOpen,
    /** Off-canvas on phones: keep it out of the tab order and screen readers. */
    drawerHidden: mobile && collapsed,
    sidebarRef,
  };
}
