import Link from "next/link";

import { WireframeNote } from "../../_components/ui";
import { mockHelpTips } from "../../mock/data";

export default function Phase1HelpPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Help · Ada tips
      </p>
      <h1 className="page-title">Help</h1>
      <p className="page-subtitle">
        Job-shaped tips that match production HelpSheet landlord answers.
      </p>

      <div className="osx-stack" style={{ marginTop: 20 }}>
        {mockHelpTips.map((tip) => (
          <div key={tip.id} className="osx-row">
            <div>
              <div>{tip.title}</div>
              <div className="osx-muted">{tip.body}</div>
            </div>
            <div className="osx-row-actions">
              <Link href={tip.href} className="btn-secondary">
                Open
              </Link>
            </div>
          </div>
        ))}
      </div>

      <WireframeNote>
        Chase → Reminders · leases → Tenancies · money out → Expenses · rent
        roll → Reports.
      </WireframeNote>
    </>
  );
}
