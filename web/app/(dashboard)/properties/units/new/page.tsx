import Link from "next/link";
import { redirect } from "next/navigation";

import { ChoosePropertyForUnit } from "@/components/ChoosePropertyForUnit";
import { fetchAllProperties } from "@/lib/api-server";

export default async function ChoosePropertyForUnitPage() {
  const all = await fetchAllProperties();
  const properties = all.map((p) => ({ id: p.id, name: p.name }));

  if (properties.length === 1) {
    redirect(`/properties/${properties[0].id}/units/new`);
  }
  if (properties.length === 0) {
    redirect("/properties/new");
  }

  return (
    <section className="form-page">
      <header className="dashboard-header">
        <p className="form-kicker">
          <Link href="/properties">Properties</Link>
          <span aria-hidden> / </span>
          Add unit
        </p>
        <h1 className="page-title">Choose a property</h1>
        <p className="page-subtitle">
          Pick which building or compound this unit belongs to.
        </p>
      </header>
      <ChoosePropertyForUnit properties={properties} />
    </section>
  );
}
