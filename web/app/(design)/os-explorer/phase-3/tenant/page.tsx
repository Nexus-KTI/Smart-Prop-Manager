import Link from "next/link";

import { formatNaira, mockTenant } from "../../mock/data";

export default function Phase3TenantPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-3">Phase 3</Link> · Tenant · PRD F34 /
        Tunde
      </p>
      <p className="osx-persona">Tenant view · Tunde</p>
      <h1 className="page-title">Your rent</h1>
      <p className="page-subtitle">
        {mockTenant.name} · {mockTenant.unit}
      </p>
      <div className="stat-row">
        <div className="stat-block">
          <div className="osx-muted">Amount due</div>
          <div className="mono-data">{formatNaira(mockTenant.balanceDue)}</div>
          <div className="osx-muted">{mockTenant.currencyNote}</div>
        </div>
      </div>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          Pay rent
        </button>
        <Link href="/os-explorer/phase-3/documents" className="btn-secondary">
          Your documents
        </Link>
        <button type="button" className="btn-secondary">
          Receipts
        </button>
      </div>
    </>
  );
}
