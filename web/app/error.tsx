"use client";

import { SegmentError, type SegmentErrorProps } from "@/components/SegmentError";

export default function RootError(props: SegmentErrorProps) {
  return (
    <div className="app-shell">
      <main className="shell-content">
        <SegmentError {...props} />
      </main>
    </div>
  );
}
