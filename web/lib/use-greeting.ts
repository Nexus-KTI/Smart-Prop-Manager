"use client";

import { useSyncExternalStore } from "react";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const noopSubscribe = () => () => {};

/** Local time-of-day greeting; null during SSR so hydration never mismatches. */
export function useGreeting(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => greetingFor(new Date().getHours()),
    () => null,
  );
}
