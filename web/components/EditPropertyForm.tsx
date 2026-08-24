"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useToast } from "@/components/ToastProvider";
import { deleteProperty, updateProperty } from "@/lib/api";
import type { Property } from "@/lib/types";

type Props = {
  property: Property;
};

export function EditPropertyForm({ property }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const typeRaw = String(form.get("type") ?? "rental").trim();
    const type =
      typeRaw === "estate" || typeRaw === "rental" ? typeRaw : "rental";
    const latRaw = String(form.get("latitude") ?? "").trim();
    const lngRaw = String(form.get("longitude") ?? "").trim();
    const latitude = latRaw && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null;
    const longitude =
      lngRaw && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null;

    try {
      if (!name) throw new Error("Property name is required.");
      const hasCoords = latitude != null && longitude != null;
      const hadCoords =
        property.latitude != null && property.longitude != null;
      await updateProperty(property.id, {
        name,
        address: address || null,
        type,
        ...(hasCoords || hadCoords
          ? {
              latitude: hasCoords ? latitude : null,
              longitude: hasCoords ? longitude : null,
            }
          : {}),
      });
      showToast("Property updated.");
      router.push(`/properties/${property.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update property.",
      );
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        `Delete ${property.name} and all of its units, payments, and reminders?`,
      )
    ) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await deleteProperty(property.id);
      showToast("Property deleted.");
      router.push("/properties");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete property.",
      );
      setDeleting(false);
    }
  }

  return (
    <form className="form-card" onSubmit={onSubmit}>
      {error ? <p className="form-error">{error}</p> : null}

      <label className="form-field">
        <span className="form-label">Property name</span>
        <input
          className="form-input"
          name="name"
          type="text"
          required
          defaultValue={property.name}
        />
      </label>

      <label className="form-field">
        <span className="form-label">Address</span>
        <AddressAutocomplete
          defaultValue={property.address ?? ""}
          defaultLatitude={property.latitude}
          defaultLongitude={property.longitude}
          placeholder="Optional"
        />
      </label>

      <label className="form-field">
        <span className="form-label">Type</span>
        <select
          className="form-input"
          name="type"
          defaultValue={property.type || "rental"}
          required
        >
          <option value="rental">Rental</option>
          <option value="estate">Estate</option>
        </select>
      </label>

      <div className="form-actions form-actions-split">
        <button
          className="btn-danger"
          type="button"
          onClick={() => void onDelete()}
          disabled={pending || deleting}
        >
          {deleting ? "Deleting…" : "Delete property"}
        </button>
        <button className="btn-primary" type="submit" disabled={pending || deleting}>
          {pending ? "Saving…" : "Save property"}
        </button>
      </div>
    </form>
  );
}
