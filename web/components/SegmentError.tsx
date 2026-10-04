"use client";

import { useEffect } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";

export type SegmentErrorProps = {
  error: Error & { digest?: string };
  unstable_retry: () => void;
};

/**
 * Route-segment fallback. Server errors reach the browser as a generic message plus a
 * digest in production, so show plain copy and the digest rather than the raw message.
 */
export function SegmentError({
  error,
  unstable_retry,
  title = "This page didn’t load",
}: SegmentErrorProps & { title?: string }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <FetchErrorState
      title={title}
      message="Something broke while loading this page. Retry; if it keeps happening, send us the reference."
      onRetry={unstable_retry}
      reference={error.digest}
    />
  );
}
