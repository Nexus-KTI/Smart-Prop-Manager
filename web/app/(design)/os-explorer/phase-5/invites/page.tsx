import Link from "next/link";

import { StatusBadge } from "../../_components/ui";
import { mockInvites } from "../../mock/data";

export default function Phase5InvitesPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-5">Phase 5</Link> · Invites · PRD F50
      </p>
      <h1 className="page-title">Guest invites</h1>
      <p className="page-subtitle">Time windows for guests and contractors.</p>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          Create invite
        </button>
      </div>
      <div className="osx-stack">
        {mockInvites.map((i) => (
          <div key={i.id} className="osx-row">
            <div>
              <div>{i.who}</div>
              <div className="osx-muted mono-data">{i.window}</div>
            </div>
            <StatusBadge status={i.status} />
          </div>
        ))}
      </div>
    </>
  );
}
