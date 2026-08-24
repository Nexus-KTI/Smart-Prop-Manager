"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { Property } from "@/lib/types";

type Props = {
  properties: Pick<Property, "id" | "name">[];
};

export function ChoosePropertyForUnit({ properties }: Props) {
  const router = useRouter();
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;
    router.push(`/properties/${propertyId}/units/new`);
  }

  return (
    <form className="form-card" onSubmit={onSubmit}>
      <label className="form-field">
        <span className="form-label">Property</span>
        <select
          className="form-input"
          name="property_id"
          required
          value={propertyId}
          onChange={(event) => setPropertyId(event.target.value)}
        >
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-actions">
        <button className="btn-primary" type="submit">
          Continue
        </button>
      </div>
    </form>
  );
}
