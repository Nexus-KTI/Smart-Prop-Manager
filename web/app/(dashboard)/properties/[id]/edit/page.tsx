import Link from "next/link";
import { notFound } from "next/navigation";

import { EditPropertyForm } from "@/components/EditPropertyForm";
import { fetchProperty } from "@/lib/api-server";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let property;
  try {
    property = await fetchProperty(id);
  } catch {
    notFound();
  }

  return (
    <section className="form-page">
      <header className="dashboard-header">
        <p className="form-kicker">
          <Link href="/properties">Properties</Link>
          <span aria-hidden> / </span>
          <Link href={`/properties/${property.id}`}>{property.name}</Link>
          <span aria-hidden> / </span>
          Edit
        </p>
        <h1 className="page-title">Edit property</h1>
        <p className="page-subtitle">{property.name}</p>
      </header>
      <EditPropertyForm property={property} />
    </section>
  );
}
