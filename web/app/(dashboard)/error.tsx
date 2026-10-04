"use client";

import { SegmentError, type SegmentErrorProps } from "@/components/SegmentError";

export default function DashboardError(props: SegmentErrorProps) {
  return <SegmentError {...props} />;
}
