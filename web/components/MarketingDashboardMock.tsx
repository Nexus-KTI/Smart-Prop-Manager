import { BRAND_NAME } from "@/lib/brand";
import { formatDueDate, formatNaira } from "@/lib/dashboard";

type DemoStatus = "overdue" | "paid" | "due-soon";

type DemoRow = {
  unit: string;
  tenant: string;
  rent: number;
  due: Date;
  status: DemoStatus;
};

/** Curated marketing portfolio, matches hero tone; not live account data. */
const DEMO_ROWS: DemoRow[] = [
  {
    unit: "Cedar Town House · Flat 7",
    tenant: "Williams",
    rent: 1_500_000,
    due: new Date(2026, 6, 3),
    status: "overdue",
  },
  {
    unit: "Ravel Hood · Flat 5",
    tenant: "Okeowo Samuel",
    rent: 1_000_000,
    due: new Date(2026, 6, 27),
    status: "overdue",
  },
  {
    unit: "Palm Court · Flat 2",
    tenant: "Ada Okonkwo",
    rent: 850_000,
    due: new Date(2026, 7, 15),
    status: "paid",
  },
  {
    unit: "Marina Lodge · Unit 1A",
    tenant: "Chinedu Bello",
    rent: 1_200_000,
    due: new Date(2026, 7, 28),
    status: "due-soon",
  },
];

const STATUS_LABEL: Record<DemoStatus, string> = {
  overdue: "OVERDUE",
  paid: "PAID",
  "due-soon": "DUE SOON",
};

type Variant = "hero" | "full" | "story";

type Props = {
  variant?: Variant;
  /** Hide figcaption under story preview (feature blocks). */
  showCaption?: boolean;
};

function demoStats(rows: DemoRow[]) {
  let totalCollected = 0;
  let outstanding = 0;
  let unitsOverdue = 0;
  for (const row of rows) {
    if (row.status === "paid") totalCollected += row.rent;
    else {
      outstanding += row.rent;
      if (row.status === "overdue") unitsOverdue += 1;
    }
  }
  return { totalCollected, outstanding, unitsOverdue };
}

/**
 * In-page product chrome for marketing, Nexora brand + formatNaira.
 * Replaces static PNGs that still showed “Smart Prop” / empty portfolio.
 */
export function MarketingDashboardMock({
  variant = "full",
  showCaption = true,
}: Props) {
  const rows =
    variant === "hero" ? DEMO_ROWS.slice(0, 2) : DEMO_ROWS;
  const stats = demoStats(DEMO_ROWS);
  const isStory = variant === "story" || variant === "hero";

  if (isStory) {
    return (
      <figure
        className="marketing-preview marketing-story-preview marketing-dash-mock"
        aria-label="Sample unit list with rent and payment status"
      >
        <div className="data-table-wrap marketing-dash-mock-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Rent</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.unit}
                  className={
                    index === 0 && row.status === "overdue"
                      ? "marketing-relief-row"
                      : undefined
                  }
                >
                  <td>{row.unit}</td>
                  <td>{row.tenant}</td>
                  <td className="mono-data">{formatNaira(row.rent)}</td>
                  <td className="mono-data">{formatDueDate(row.due)}</td>
                  <td>
                    {index === 0 && row.status === "overdue" ? (
                      <span
                        className="marketing-relief-badge"
                        aria-label="Overdue, then paid"
                      >
                        <span className="marketing-relief-before status-badge overdue">
                          OVERDUE
                        </span>
                        <span className="marketing-relief-after status-badge paid">
                          PAID
                        </span>
                      </span>
                    ) : (
                      <span className={`status-badge ${row.status}`}>
                        {STATUS_LABEL[row.status]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showCaption ? (
          <figcaption className="marketing-story-caption">
            Williams pays. The list exhales.
          </figcaption>
        ) : null}
      </figure>
    );
  }

  return (
    <div
      className="marketing-preview marketing-dash-mock marketing-dash-mock-full"
      aria-label={`${BRAND_NAME} properties dashboard preview`}
    >
      <aside className="marketing-dash-mock-sidebar" aria-hidden="true">
        <p className="marketing-dash-mock-brand">{BRAND_NAME}</p>
        <nav className="marketing-dash-mock-nav">
          <span className="is-active">Properties</span>
          <span>Payments</span>
          <span>Reminders</span>
        </nav>
      </aside>
      <div className="marketing-dash-mock-main">
        <header className="marketing-dash-mock-header">
          <div>
            <h3 className="marketing-dash-mock-title">Properties</h3>
            <p className="marketing-dash-mock-lede">
              Units across your portfolio with rent and payment status.
            </p>
          </div>
          <span className="btn-primary marketing-dash-mock-cta" aria-hidden="true">
            Add property
          </span>
        </header>
        <div className="stat-row">
          <div className="stat-block">
            <p className="stat-label">Total Collected</p>
            <p className="stat-value mono-data">
              {formatNaira(stats.totalCollected)}
            </p>
          </div>
          <div className="stat-block">
            <p className="stat-label">Outstanding</p>
            <p className="stat-value mono-data">
              {formatNaira(stats.outstanding)}
            </p>
          </div>
          <div className="stat-block">
            <p className="stat-label">Units Overdue</p>
            <p className="stat-value mono-data">{stats.unitsOverdue}</p>
          </div>
        </div>
        <div className="data-table-wrap marketing-dash-mock-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Rent</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.unit}>
                  <td>{row.unit}</td>
                  <td>{row.tenant}</td>
                  <td className="mono-data">{formatNaira(row.rent)}</td>
                  <td className="mono-data">{formatDueDate(row.due)}</td>
                  <td>
                    <span className={`status-badge ${row.status}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
