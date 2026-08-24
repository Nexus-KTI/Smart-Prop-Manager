import Link from "next/link";

import { AddUnitForm } from "@/components/AddUnitForm";

export default async function NewUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <section className="form-page">
      <header className="dashboard-header">
        <p className="form-kicker">
          <Link href="/properties">Properties</Link>
          <span aria-hidden> / </span>
          Add unit
        </p>
        <h1 className="page-title">Add unit</h1>
        <p className="page-subtitle">
          Set rent, schedule, and tenant details for this unit.
        </p>
      </header>

      <AddUnitForm propertyId={id} />
    </section>
  );
}
