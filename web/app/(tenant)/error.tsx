"use client";

import { SegmentError, type SegmentErrorProps } from "@/components/SegmentError";

export default function TenantError(props: SegmentErrorProps) {
  return <SegmentError {...props} />;
}
