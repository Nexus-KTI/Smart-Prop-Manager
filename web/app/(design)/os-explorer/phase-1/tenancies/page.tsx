"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge, WireSegment, WireframeNote } from "../../_components/ui";
import { mockTenancies } from "../../mock/data";

type ListFilter = "all" | "active" | "ending_soon";

export default function Phase1TenanciesPage() {
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [showEmpty, setShowEmpty] = useState(false);

  const counts = {
    all: mockTenancies.length,
    active: mockTenancies.filter((t) => t.status === "active").length,
    ending_soon: mockTenancies.filter((t) => t.endingSoon).length,
  };

  const visible = mockTenancies.filter((t) => {
    if (listFilter === "ending_soon") return t.endingSoon;
    if (listFilter === "active") return t.status === "active";
    return true;
  });

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Tenancies · Ending
        soon + vacant deep-link
      </p>
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Tenancies</h1>
          <p className="page-subtitle">
            Occupancy, invites, and term end across your portfolio.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link
            href="/os-explorer/phase-1/portfolio?occupancy=vacant"
            className="btn-secondary"
          >
            Vacant units
          </Link>
          <Link href="/os-explorer/phase-1/portfolio" className="btn-primary">
            Properties
          </Link>
        </div>
      </header>

      <label className="osx-radio" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={showEmpty}
          onChange={(e) => setShowEmpty(e.target.checked)}
        />
        Preview empty state
      </label>

      {showEmpty || mockTenancies.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No tenancies yet.</p>
          <p className="dashboard-empty-copy">
            On Properties, open a vacant unit → Start tenancy → send the claim
            invite. Leases appear here even before the tenant claims.
          </p>
          <div className="dashboard-header-actions">
            <Link
              href="/os-explorer/phase-1/portfolio?occupancy=vacant"
              className="btn-primary"
            >
              Find vacant units
            </Link>
            <Link
              href="/os-explorer/phase-1/portfolio"
              className="btn-secondary"
            >
              Go to properties
            </Link>
          </div>
        </div>
      ) : (
        <>
          <WireSegment
            label="Show"
            value={listFilter}
            onChange={setListFilter}
            options={[
              { id: "all", label: "All", count: counts.all },
              { id: "active", label: "Active", count: counts.active },
              {
                id: "ending_soon",
                label: "Ending soon",
                count: counts.ending_soon,
              },
            ]}
          />

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Term end</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-muted">
                      {listFilter === "ending_soon"
                        ? "No leases ending within 60 days. Switch to All."
                        : "No tenancies in this filter."}
                    </td>
                  </tr>
                ) : (
                  visible.map((t) => (
                    <tr key={t.id}>
                      <td>{t.property}</td>
                      <td>{t.unit}</td>
                      <td>{t.tenant}</td>
                      <td>
                        <StatusBadge
                          status={t.endingSoon ? "DUE SOON" : "ACTIVE"}
                        />
                      </td>
                      <td className="mono-data">{t.termEnd}</td>
                      <td>
                        <div className="table-actions">
                          <Link
                            href="/os-explorer/phase-1/unit"
                            className="table-link"
                          >
                            Payments
                          </Link>
                          <Link
                            href="/os-explorer/phase-3"
                            className="table-link"
                          >
                            Dossier
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <WireframeNote>
        Prod: All / Active / Ending soon (60d); empty → Find vacant units
        (`/properties?occupancy=vacant`).
      </WireframeNote>
    </>
  );
}
