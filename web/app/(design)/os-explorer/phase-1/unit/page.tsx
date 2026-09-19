import Link from "next/link";

import { StatusBadge, WireframeNote } from "../../_components/ui";
import { formatNaira, mockPortfolio } from "../../mock/data";

export default function Phase1UnitPage() {
  const unit = mockPortfolio.properties[0].units[0];
  const paidUnit = mockPortfolio.properties[0].units[1];
  const amountDue = unit.status === "PAID" ? 0 : unit.rent;

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1/portfolio">Properties</Link> · Unit
        payments · amount due
      </p>
      <p className="form-kicker">
        {mockPortfolio.properties[0].name} · {unit.label}
      </p>
      <h1 className="page-title">{unit.tenant}</h1>
      <p className="page-subtitle">
        Due day {unit.dueDay} ·{" "}
        <span className="mono-data">{unit.phone}</span>
      </p>

      <div className="stat-row unit-cycle-due" style={{ marginTop: 20 }}>
        <div className="stat-block">
          <p className="stat-label">Amount due this cycle</p>
          <p className="stat-value mono-data">{formatNaira(amountDue)}</p>
          <p className="table-muted">
            {amountDue > 0
              ? "Rent still open · Due 01 Aug 2026"
              : "This cycle is settled · Next due 01 Sep 2026"}
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Status</p>
          <p className="stat-value">
            <StatusBadge status={unit.status} />
          </p>
          {amountDue > 0 ? (
            <Link
              href="/os-explorer/phase-1/payments"
              className="btn-primary"
              style={{ marginTop: 8, display: "inline-flex" }}
            >
              Record payment
            </Link>
          ) : (
            <button type="button" className="btn-secondary" style={{ marginTop: 8 }}>
              Log next rent early
            </button>
          )}
          {unit.status === "OVERDUE" ? (
            <p style={{ marginTop: 8 }}>
              <Link
                href="/os-explorer/phase-1/reminders"
                className="table-link"
              >
                Chase / remind →
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <div className="unit-charge-lines" aria-label="Charge status" style={{ marginTop: 16 }}>
        <div className="unit-charge-line">
          <div className="unit-charge-line-meta">
            <strong>Rent</strong>
            <span className="mono-data">{formatNaira(unit.rent)}</span>
          </div>
          <StatusBadge status={unit.status} />
        </div>
        <div className="unit-charge-line">
          <div className="unit-charge-line-meta">
            <strong>Service charge</strong>
            <span className="mono-data">{formatNaira(45_000)}</span>
          </div>
          <StatusBadge status="OVERDUE" />
        </div>
      </div>

      <div className="osx-actions" style={{ marginTop: 20 }}>
        <Link href="/os-explorer/phase-1/payments" className="btn-primary">
          Record manual payment
        </Link>
        <button type="button" className="btn-secondary">
          Paystack
        </button>
        <Link href="/os-explorer/phase-1/reminders" className="btn-secondary">
          Reminders
        </Link>
      </div>

      <p className="page-subtitle" style={{ marginTop: 24 }}>
        Also in mock:{" "}
        <span className="mono-data">
          {paidUnit.label} is {paidUnit.status}
        </span>{" "}
 - production shows next due + Log next rent early when settled.
      </p>

      <WireframeNote>
        Wireframe mirrors unit Payments “amount due this cycle” + chase link.
        Mock only.
      </WireframeNote>
    </>
  );
}
