import Link from "next/link";

import { mockArtisan } from "../../mock/data";

export default function Phase5ArtisanPage() {
  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-5">Phase 5</Link> · Artisan · PRD F51 /
        Sola
      </p>
      <p className="osx-persona">Artisan view · Sola</p>
      <h1 className="page-title">Your jobs</h1>
      <p className="page-subtitle">{mockArtisan.name}</p>
      <div className="osx-stack">
        {mockArtisan.jobs.length === 0 ? (
          <div className="dashboard-empty">
            <p>No jobs assigned</p>
          </div>
        ) : (
          mockArtisan.jobs.map((j) => (
            <div key={j.id} className="form-card">
              <h2 style={{ fontSize: "1.05rem", margin: "0 0 8px" }}>
                {j.title}
              </h2>
              <p className="osx-muted">{j.unit}</p>
              <p>
                When <span className="mono-data">{j.window}</span>
              </p>
              <p>
                Gate code <span className="mono-data">{j.accessCode}</span>
              </p>
              <div className="osx-actions">
                <button type="button" className="btn-primary">
                  Mark done
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
