import Link from "next/link";

import { NewPropertyForm } from "@/components/NewPropertyForm";

export default function NewPropertyPage() {
  return (
    <section className="form-page">
      <header className="dashboard-header">
        <p className="form-kicker">
          <Link href="/properties">Properties</Link>
          <span aria-hidden> / </span>
          New
        </p>
        <h1 className="page-title">New property</h1>
        <p className="page-subtitle">
          Add the property details, then you’ll set up the first unit.
        </p>
      </header>

      <NewPropertyForm />
    </section>
  );
}
