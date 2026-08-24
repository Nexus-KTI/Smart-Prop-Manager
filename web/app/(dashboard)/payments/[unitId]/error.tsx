"use client";

import { useEffect } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";

export default function UnitPaymentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unit payments route error:", error);
  }, [error]);

  return (
    <FetchErrorState
      title="Couldn’t load payments"
      message={
        error.message?.trim() || "Check your connection and try again."
      }
      onRetry={reset}
    />
  );
}
