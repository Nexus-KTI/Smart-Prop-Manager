import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { mockDocs } from "../../mock/data";

export default function Phase3DocumentsPage() {
  const missing = mockDocs.every((d) => d.status === "missing");

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-3">Phase 3</Link> · Documents · PRD F31
      </p>
      <h1 className="page-title">Documents</h1>
      <p className="page-subtitle">ID, agreement, references — mock upload.</p>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          Upload document
        </button>
      </div>
      {missing ? (
        <div className="dashboard-empty">
          <p>No documents yet</p>
          <button type="button" className="btn-primary">
            Upload document
          </button>
        </div>
      ) : (
        <div className="osx-stack">
          {mockDocs.map((d) => (
            <div key={d.id} className="osx-row">
              <div>{d.name}</div>
              <StatusBadge status={d.status} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
