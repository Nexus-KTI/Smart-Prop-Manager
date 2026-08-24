import Link from "next/link";

import { mockTeam } from "../../mock/data";

export default function Phase4TeamPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-4">Phase 4</Link> · Team · PRD F40 / §13
      </p>
      <p className="osx-persona">Owner / Manager only · not caretaker admin</p>
      <h1 className="page-title">Team</h1>
      <p className="page-subtitle">
        Invite managers or caretakers. Caretakers chase and log cash — they do
        not invite staff.
      </p>
      <div className="osx-actions">
        <button type="button" className="btn-primary">
          Invite staff
        </button>
      </div>
      <div className="osx-stack">
        {mockTeam.map((m) => (
          <div key={m.id} className="osx-row">
            <div>{m.name}</div>
            <span className="status-badge pending">{m.role}</span>
          </div>
        ))}
      </div>
    </>
  );
}
