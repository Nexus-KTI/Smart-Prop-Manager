"use client";

import { useEffect } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";

export default function UnitRemindersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unit reminders route error:", error);
  }, [error]);

  return (
    <FetchErrorState
      title="Couldn’t load reminders"
      message={
        error.message?.trim() || "Check your connection and try again."
      }
      onRetry={reset}
    />
  );
}
