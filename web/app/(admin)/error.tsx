"use client";

import { SegmentError, type SegmentErrorProps } from "@/components/SegmentError";

export default function AdminError(props: SegmentErrorProps) {
  return <SegmentError {...props} />;
}
