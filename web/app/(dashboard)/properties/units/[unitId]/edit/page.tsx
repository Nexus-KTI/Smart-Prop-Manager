import Link from "next/link";
import { notFound } from "next/navigation";

import { EditUnitForm } from "@/components/EditUnitForm";
import { fetchUnitDetail } from "@/lib/api-server";

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;

  let detail;
  try {
    detail = await fetchUnitDetail(unitId);
  } catch {
    notFound();
  }

  return (
    <section className="form-page">
      <header className="dashboard-header">
        <p className="form-kicker">
          <Link href="/properties">Properties</Link>
          <span aria-hidden> / </span>
          Edit unit
        </p>
        <h1 className="page-title">Edit unit</h1>
        <p className="page-subtitle">
          {detail.propertyName
            ? `${detail.propertyName} · ${detail.unit.label}`
            : detail.unit.label}
        </p>
      </header>
      <EditUnitForm unit={detail.unit} propertyName={detail.propertyName} />
    </section>
  );
}
