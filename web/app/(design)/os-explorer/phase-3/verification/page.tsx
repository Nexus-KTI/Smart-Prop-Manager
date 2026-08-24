import Link from "next/link";

import { mockVerification } from "../../mock/data";

export default function Phase3VerificationPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-3">Phase 3</Link> · Checklist · PRD
        F32/F33
      </p>
      <p className="osx-persona">Landlord view · Ada</p>
      <h1 className="page-title">Move-in checklist</h1>
      <p className="page-subtitle">
        Tick each step. Background check stays optional / external when used.
      </p>
      <ul className="osx-check">
        {mockVerification.map((step) => (
          <li key={step.id}>
            <span className="osx-dot" data-done={step.done ? "true" : "false"} />
            <div>
              <div>{step.label}</div>
              {"note" in step && step.note ? (
                <div className="osx-muted">{step.note}</div>
              ) : null}
            </div>
            {!step.done ? (
              <button type="button" className="btn-secondary">
                {step.id === "v4" ? "Request check" : "Mark done"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
