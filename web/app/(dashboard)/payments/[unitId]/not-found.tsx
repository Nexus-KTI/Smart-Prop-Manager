import Link from "next/link";

export default function UnitPaymentsNotFound() {
  return (
    <section className="dashboard">
      <div className="dashboard-empty" role="status">
        <p className="dashboard-empty-title mono-data">Unit not found.</p>
        <p className="dashboard-empty-copy">
          It may be gone or you don&apos;t have access.
        </p>
        <Link href="/properties" className="btn-primary">
          Back to properties
        </Link>
      </div>
    </section>
  );
}
