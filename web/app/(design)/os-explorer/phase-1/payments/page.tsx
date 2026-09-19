"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge, WireSegment, WireframeNote } from "../../_components/ui";
import { formatNaira, mockPayments, mockUnitRows } from "../../mock/data";

type ListFilter = "money_in" | "OVERDUE" | "DUE SOON";

export default function Phase1PaymentsPage() {
  const [listFilter, setListFilter] = useState<ListFilter>("money_in");
  const rows = mockUnitRows().filter((r) => !r.needsUnit);
  const overdue = rows.filter((r) => r.status === "OVERDUE");
  const dueSoon = rows.filter((r) => r.status === "DUE SOON");
  const oweRows =
    listFilter === "OVERDUE"
      ? overdue
      : listFilter === "DUE SOON"
        ? dueSoon
        : [];

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Payments · money in +
        who owes
      </p>
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Recent money in across your units. Open a unit to record a payment.
          </p>
        </div>
        <div className="dashboard-header-actions">
          {overdue.length > 0 ? (
            <Link href="/os-explorer/phase-1/reminders" className="btn-primary">
              {overdue.length} overdue → Chase
            </Link>
          ) : (
            <Link
              href="/os-explorer/phase-1/reminders"
              className="btn-secondary"
            >
              Reminders
            </Link>
          )}
          <Link href="/os-explorer/phase-1/portfolio" className="btn-secondary">
            Properties
          </Link>
        </div>
      </header>

      {overdue.length > 0 ? (
        <p className="page-subtitle" role="status">
          {overdue.length} unit{overdue.length === 1 ? "" : "s"} overdue.{" "}
          <Link href="/os-explorer/phase-1/unit" className="table-link">
            Open overdue unit
          </Link>
          {" · "}
          <Link href="/os-explorer/phase-1/reminders" className="table-link">
            Chase on Reminders
          </Link>
        </p>
      ) : null}

      <WireSegment
        label="Show"
        value={listFilter}
        onChange={setListFilter}
        options={[
          { id: "money_in", label: "Money in", count: mockPayments.length },
          { id: "OVERDUE", label: "Overdue", count: overdue.length },
          { id: "DUE SOON", label: "Due soon", count: dueSoon.length },
        ]}
      />

      {listFilter === "money_in" ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Unit</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {mockPayments.map((p) => (
                <tr key={p.id}>
                  <td className="mono-data">{p.date}</td>
                  <td>
                    <Link
                      href="/os-explorer/phase-1/unit"
                      className="table-link"
                    >
                      {p.unit}
                    </Link>
                  </td>
                  <td className="mono-data">{formatNaira(p.amount)}</td>
                  <td>{p.method}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td>
                    {p.status === "PAID" ? (
                      <button type="button" className="table-link">
                        Open receipt
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : oweRows.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">
            {listFilter === "OVERDUE"
              ? "No overdue units."
              : "No due-soon units."}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setListFilter("money_in")}
          >
            Show money in
          </button>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {oweRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.property} · {r.label}
                  </td>
                  <td>{r.tenant}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <div className="table-actions">
                      <Link
                        href="/os-explorer/phase-1/unit"
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WireframeNote>
        Wireframe: Money in / Overdue / Due soon parity with production
        Payments. Mock only.
      </WireframeNote>
    </>
  );
}
