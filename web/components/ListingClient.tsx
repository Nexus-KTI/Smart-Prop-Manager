"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { previewListingToken } from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";

export function ListingClient() {
  const params = useParams();
  const token = String(params?.token || "");
  const [listing, setListing] = useState<{
    property_name?: string | null;
    area?: string | null;
    unit_label?: string | null;
    rent_amount?: number | string | null;
    photo_url?: string | null;
    apply_note?: string | null;
    apply_path?: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await previewListingToken(token);
        if (!cancelled) setListing(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Listing not found");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <section className="dashboard">
        <h1 className="page-title">Listing</h1>
        <p className="form-error">{error}</p>
      </section>
    );
  }

  if (!listing) {
    return <p className="page-subtitle">Loading listing…</p>;
  }

  const title = `${listing.property_name || "Property"}${
    listing.unit_label ? ` · ${listing.unit_label}` : ""
  }`;
  const rent =
    listing.rent_amount != null && listing.rent_amount !== ""
      ? formatNaira(Number(listing.rent_amount))
      : null;
  const applyHref = listing.apply_path || `/apply/${token}`;

  return (
    <section className="dashboard">
      {listing.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="apply-photo" src={listing.photo_url} alt={title} />
      ) : null}
      <h1 className="page-title">{title}</h1>
      {listing.area ? <p className="page-subtitle">{listing.area}</p> : null}
      {rent ? <p className="mono-data">{rent}</p> : null}
      {listing.apply_note ? (
        <p className="page-subtitle">{listing.apply_note}</p>
      ) : null}
      <Link href={applyHref} className="btn-primary">
        Apply
      </Link>
    </section>
  );
}
