"use client";

import type { ReactNode } from "react";

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "paid" ||
    normalized === "sent" ||
    normalized === "done" ||
    normalized === "active" ||
    normalized === "uploaded"
      ? "paid"
      : normalized === "overdue" ||
          normalized === "failed" ||
          normalized === "missing" ||
          normalized === "expired"
        ? "overdue"
        : normalized === "due soon" || normalized.includes("due")
          ? "due-soon"
          : "pending";
  return <span className={`status-badge ${tone}`}>{status}</span>;
}

export function WireSegment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; count?: number }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="portfolio-occupancy-bar" style={{ marginBottom: 12 }}>
      <p className="form-label" style={{ margin: 0, minWidth: "5.5rem" }}>
        {label}
      </p>
      <div className="theme-segment" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className="theme-segment-btn"
            data-active={value === opt.id ? "true" : "false"}
            aria-pressed={value === opt.id}
            onClick={() => onChange(opt.id)}
          >
            {opt.label}
            {opt.count != null ? ` (${opt.count})` : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WireframeNote({ children }: { children: ReactNode }) {
  return (
    <p className="osx-muted" style={{ marginTop: 16 }}>
      {children}
    </p>
  );
}

