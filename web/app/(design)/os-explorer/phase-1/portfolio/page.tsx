"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { StatusBadge, WireSegment, WireframeNote } from "../../_components/ui";
import { formatNaira, mockUnitRows } from "../../mock/data";

type Occupancy = "all" | "occupied" | "vacant";
type Payment = "all" | "OVERDUE" | "DUE SOON" | "PAID" | "PENDING";

function initialOccupancy(raw: string | null): Occupancy {
  if (raw === "vacant" || raw === "occupied") return raw;
  return "all";
}

function Phase1PortfolioInner() {
  const searchParams = useSearchParams();
  const rows = mockUnitRows();
  const [occupancy, setOccupancy] = useState<Occupancy>(() =>
    initialOccupancy(searchParams.get("occupancy")),
  );
  const [payment, setPayment] = useState<Payment>("all");

  const occCounts = {
    all: rows.length,
    occupied: rows.filter((r) => !r.vacant && !r.needsUnit).length,
    vacant: rows.filter((r) => r.vacant || r.needsUnit).length,
  };
  const payCounts = {
    all: rows.filter((r) => !r.needsUnit).length,
    OVERDUE: rows.filter((r) => r.status === "OVERDUE").length,
    "DUE SOON": rows.filter((r) => r.status === "DUE SOON").length,
    PAID: rows.filter((r) => r.status === "PAID").length,
    PENDING: rows.filter((r) => r.status === "PENDING" && !r.needsUnit).length,
  };

  const visible = rows.filter((r) => {
    if (occupancy === "occupied" && (r.vacant || r.needsUnit)) return false;
    if (occupancy === "vacant" && !r.vacant && !r.needsUnit) return false;
    if (payment === "all") return true;
    if (r.needsUnit) return false;
    return r.status === payment;
  });

  const overdue = payCounts.OVERDUE;

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Properties · Ada
        money list
      </p>
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">
            Units, rent, and payment status across your portfolio.
          </p>
        </div>
        <div className="dashboard-header-actions">
          {overdue > 0 ? (
            <Link href="/os-explorer/phase-1/reminders" className="btn-outline">
              {overdue} overdue → Chase
            </Link>
          ) : null}
          <Link href="/os-explorer/phase-1/unit" className="btn-primary">
            Add unit
          </Link>
        </div>
      </header>

      <WireSegment
        label="Occupancy"
        value={occupancy}
        onChange={setOccupancy}
        options={[
          { id: "all", label: "All", count: occCounts.all },
          { id: "occupied", label: "Occupied", count: occCounts.occupied },
          { id: "vacant", label: "Vacant", count: occCounts.vacant },
        ]}
      />
      <WireSegment
        label="Payment"
        value={payment}
        onChange={setPayment}
        options={[
          { id: "all", label: "All", count: payCounts.all },
          { id: "OVERDUE", label: "Overdue", count: payCounts.OVERDUE },
          { id: "DUE SOON", label: "Due soon", count: payCounts["DUE SOON"] },
          { id: "PAID", label: "Paid", count: payCounts.PAID },
          { id: "PENDING", label: "Pending", count: payCounts.PENDING },
        ]}
      />

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Tenant</th>
              <th>Rent</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="table-muted">
                  No units match these filters.
                </td>
              </tr>
            ) : null}
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.needsUnit ? (
                    <>
                      {r.property}
                      <p className="table-muted table-empty-hint">
                        No units yet. Add a unit to track rent.
                      </p>
                    </>
                  ) : (
                    <Link
                      href="/os-explorer/phase-1/unit"
                      className="table-link"
                    >
                      {r.property} · {r.label}
                    </Link>
                  )}
                </td>
                <td>{r.tenant}</td>
                <td className="mono-data">
                  {r.needsUnit ? "-" : formatNaira(r.rent)}
                </td>
                <td>
                  {r.needsUnit ? (
                    <span className="status-badge pending">NO UNIT</span>
                  ) : (
                    <StatusBadge status={r.status} />
                  )}
                </td>
                <td>
                  <div className="table-actions">
                    {r.needsUnit ? (
                      <Link
                        href="/os-explorer/phase-1/unit"
                        className="btn-primary btn-table-cta"
                      >
                        Add unit
                      </Link>
                    ) : r.vacant ? (
                      <Link
                        href="/os-explorer/phase-3"
                        className="btn-primary btn-table-cta"
                      >
                        Start tenancy
                      </Link>
                    ) : r.status === "OVERDUE" || r.status === "DUE SOON" ? (
                      <>
                        <Link
                          href="/os-explorer/phase-1/payments"
                          className="btn-primary btn-table-cta"
                        >
                          Record payment
                        </Link>
                        <Link
                          href="/os-explorer/phase-1/reminders"
                          className="table-link"
                        >
                          Remind
                        </Link>
                      </>
                    ) : (
                      <Link
                        href="/os-explorer/phase-1/unit"
                        className="table-link"
                      >
                        Open
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WireframeNote>
        Occupancy deep-link: `/os-explorer/phase-1/portfolio?occupancy=vacant`
        (prod `/properties?occupancy=vacant`). Vacant → Start tenancy.
      </WireframeNote>
    </>
  );
}

export default function Phase1PortfolioPage() {
  return (
    <Suspense fallback={<p className="page-subtitle">Loading…</p>}>
      <Phase1PortfolioInner />
    </Suspense>
  );
}
