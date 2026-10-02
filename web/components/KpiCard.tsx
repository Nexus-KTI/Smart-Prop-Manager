import { ArrowRight, ArrowUp, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Portfolio headline numbers. Children must be `KpiCard`s (dl > div > dt/dd). */
export function KpiGrid({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <dl className="kpi-grid" aria-label={label}>
      {children}
    </dl>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  tone?: "alert";
}) {
  return (
    <div className="kpi-card" data-tone={tone}>
      <dt className="kpi-card-label">
        <span className="kpi-card-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={1.75} />
        </span>
        {label}
      </dt>
      <dd className="kpi-card-value mono-data">{value}</dd>
      {foot ? <dd className="kpi-card-foot">{foot}</dd> : null}
    </div>
  );
}

/** Small direction + count line for `KpiCard` foot ("↑ 2 new", "→ 0 in progress"). */
export function KpiTrend({
  tone = "muted",
  children,
}: {
  tone?: "up" | "alert" | "muted";
  children: ReactNode;
}) {
  const Icon = tone === "muted" ? ArrowRight : ArrowUp;
  return (
    <span className="kpi-trend" data-tone={tone}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      {children}
    </span>
  );
}
