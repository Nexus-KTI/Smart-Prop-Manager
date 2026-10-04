"use client";

import { SegmentError, type SegmentErrorProps } from "@/components/SegmentError";
import { BRAND_NAME } from "@/lib/brand";

import "./globals.css";

/** Replaces the root layout when it throws, so it brings its own html/body. */
export default function GlobalError(props: SegmentErrorProps) {
  return (
    <html lang="en" data-theme="light" className="h-full antialiased">
      <body className="min-h-full">
        <title>{`${BRAND_NAME} · Something went wrong`}</title>
        <div className="app-shell">
          <main className="shell-content">
            <SegmentError {...props} title={`${BRAND_NAME} didn’t load`} />
          </main>
        </div>
      </body>
    </html>
  );
}
