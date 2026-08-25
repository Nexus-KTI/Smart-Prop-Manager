import { BRAND_NAME } from "@/lib/brand";
import { formatDueDate, formatNaira } from "@/lib/dashboard";

const ROWS = [
  {
    unit: "Cedar · Flat 7",
    tenant: "Williams",
    rent: 1_500_000,
    due: new Date(2026, 6, 3),
    status: "overdue" as const,
    relief: true,
  },
  {
    unit: "Palm Court · 2",
    tenant: "Ada Okonkwo",
    rent: 850_000,
    due: new Date(2026, 7, 15),
    status: "paid" as const,
    relief: false,
  },
  {
    unit: "Marina · 1A",
    tenant: "Chinedu Bello",
    rent: 1_200_000,
    due: new Date(2026, 7, 28),
    status: "due-soon" as const,
    relief: false,
  },
];

const LABEL = {
  overdue: "OVERDUE",
  paid: "PAID",
  "due-soon": "DUE SOON",
} as const;

/**
 * Compact product window for the marketing hero, stats + unit list with
 * overdue→paid beat. Sized for a half-column without page overflow.
 */
export function MarketingHeroFrame() {
  return (
    <div className="marketing-hero-frame" aria-label={`${BRAND_NAME} portfolio preview`}>
      <div className="marketing-hero-frame-chrome" aria-hidden>
        <span className="marketing-hero-frame-dot" />
        <span className="marketing-hero-frame-dot" />
        <span className="marketing-hero-frame-dot" />
        <span className="marketing-hero-frame-chrome-title">{BRAND_NAME}</span>
      </div>
      <div className="marketing-hero-frame-body">
        <div className="marketing-hero-frame-stats">
          <div>
            <p className="marketing-hero-frame-stat-label">Collected</p>
            <p className="marketing-hero-frame-stat-value mono-data">
              {formatNaira(850_000)}
            </p>
          </div>
          <div>
            <p className="marketing-hero-frame-stat-label">Outstanding</p>
            <p className="marketing-hero-frame-stat-value mono-data">
              {formatNaira(2_700_000)}
            </p>
          </div>
          <div>
            <p className="marketing-hero-frame-stat-label">Overdue</p>
            <p className="marketing-hero-frame-stat-value mono-data">2</p>
          </div>
        </div>
        <ul className="marketing-hero-frame-list">
          {ROWS.map((row) => (
            <li
              key={row.unit}
              className={
                row.relief ? "marketing-hero-frame-row marketing-relief-row" : "marketing-hero-frame-row"
              }
            >
              <div className="marketing-hero-frame-row-main">
                <span className="marketing-hero-frame-unit">{row.unit}</span>
                <span className="marketing-hero-frame-tenant">{row.tenant}</span>
              </div>
              <div className="marketing-hero-frame-row-meta">
                <span className="mono-data">{formatNaira(row.rent)}</span>
                <span className="mono-data marketing-hero-frame-due">
                  {formatDueDate(row.due)}
                </span>
                {row.relief ? (
                  <span className="marketing-relief-badge" aria-label="Overdue, then paid">
                    <span className="marketing-relief-before status-badge overdue">
                      OVERDUE
                    </span>
                    <span className="marketing-relief-after status-badge paid">PAID</span>
                  </span>
                ) : (
                  <span className={`status-badge ${row.status}`}>
                    {LABEL[row.status]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
