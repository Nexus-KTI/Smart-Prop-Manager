import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { formatNaira, mockPortfolio } from "../../mock/data";

export default function Phase1UnitPage() {
  const unit = mockPortfolio.properties[0].units[0];

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1/portfolio">Portfolio</Link> · Unit ·
        PRD J2
      </p>
      <p className="form-kicker">
        {mockPortfolio.properties[0].name} · {unit.label}
      </p>
      <h1 className="page-title">{unit.tenant}</h1>
      <p className="page-subtitle">
        Due day {unit.dueDay} ·{" "}
        <span className="mono-data">{unit.phone}</span>
      </p>
      <div className="osx-actions">
        <StatusBadge status={unit.status} />
      </div>
      <div className="stat-row" style={{ marginTop: 20 }}>
        <div className="stat-block">
          <div className="osx-muted">Rent</div>
          <div className="mono-data">{formatNaira(unit.rent)}</div>
        </div>
      </div>
      <div className="osx-actions">
        <Link href="/os-explorer/phase-1/payments" className="btn-primary">
          Record payment
        </Link>
        <Link href="/os-explorer/phase-1/payments" className="btn-secondary">
          Paystack
        </Link>
        <Link href="/os-explorer/phase-1/reminders" className="btn-secondary">
          Send reminder
        </Link>
      </div>
    </>
  );
}
