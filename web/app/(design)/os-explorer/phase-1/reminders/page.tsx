"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge, WireSegment, WireframeNote } from "../../_components/ui";
import { mockUnitRows } from "../../mock/data";

type ListFilter = "urgent" | "overdue" | "ending_soon" | "failed";

type ActionRow = {
  id: string;
  label: string;
  tenant: string;
  kind: "OVERDUE" | "ENDING SOON" | "FAILED" | "DUE SOON";
  detail: string;
};

export default function Phase1RemindersPage() {
  const units = mockUnitRows().filter((r) => !r.needsUnit && !r.vacant);
  const overdue = units.filter((u) => u.status === "OVERDUE");
  const dueSoon = units.filter((u) => u.status === "DUE SOON");

  const actions: ActionRow[] = [
    ...overdue.map((u) => ({
      id: `over-${u.id}`,
      label: `${u.property} · ${u.label}`,
      tenant: u.tenant,
      kind: "OVERDUE" as const,
      detail: "Past due - chase",
    })),
    {
      id: "lease-1a",
      label: "12 Adeniran Ogunsanya · Flat 1A",
      tenant: "Chioma Okeke",
      kind: "ENDING SOON" as const,
      detail: "Term ends in 40 days",
    },
    {
      id: "fail-1a",
      label: "12 Adeniran Ogunsanya · Flat 1A",
      tenant: "Chioma Okeke",
      kind: "FAILED" as const,
      detail: "Provider timeout - retry",
    },
    ...dueSoon.map((u) => ({
      id: `soon-${u.id}`,
      label: `${u.property} · ${u.label}`,
      tenant: u.tenant,
      kind: "DUE SOON" as const,
      detail: "Due within 7 days",
    })),
  ];

  const [listFilter, setListFilter] = useState<ListFilter>("urgent");

  const visible = actions.filter((a) => {
    if (listFilter === "urgent") return true;
    if (listFilter === "overdue") return a.kind === "OVERDUE";
    if (listFilter === "ending_soon") return a.kind === "ENDING SOON";
    return a.kind === "FAILED";
  });

  const counts = {
    urgent: actions.length,
    overdue: actions.filter((a) => a.kind === "OVERDUE").length,
    ending_soon: actions.filter((a) => a.kind === "ENDING SOON").length,
    failed: actions.filter((a) => a.kind === "FAILED").length,
  };

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Action needed · Ada
        Friday list
      </p>
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Action needed</h1>
          <p className="page-subtitle">
            Chase rent, fix failed sends, renewals ending soon.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <button type="button" className="btn-primary">
            Remind selected ({overdue.length})
          </button>
        </div>
      </header>

      <WireSegment
        label="Show"
        value={listFilter}
        onChange={setListFilter}
        options={[
          { id: "urgent", label: "Urgent", count: counts.urgent },
          { id: "overdue", label: "Overdue", count: counts.overdue },
          {
            id: "ending_soon",
            label: "Ending soon",
            count: counts.ending_soon,
          },
          { id: "failed", label: "Failed", count: counts.failed },
        ]}
      />

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <span className="sr-only">Select</span>
              </th>
              <th>Unit</th>
              <th>Tenant</th>
              <th>Why</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    defaultChecked={row.kind === "OVERDUE"}
                    aria-label={`Select ${row.label}`}
                  />
                </td>
                <td>
                  <Link href="/os-explorer/phase-1/unit" className="table-link">
                    {row.label}
                  </Link>
                </td>
                <td>{row.tenant}</td>
                <td>{row.detail}</td>
                <td>
                  <StatusBadge status={row.kind} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WireframeNote>
        Prod: GET /reminders/actions ranks overdue + lease ending (60d) + failed
        chase. Bell deep-links filter=overdue|ending_soon|failed.
      </WireframeNote>
    </>
  );
}
