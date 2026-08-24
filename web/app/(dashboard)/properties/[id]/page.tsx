"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { LoadMoreButton } from "@/components/LoadMoreButton";
import { TableSkeleton } from "@/components/TableSkeleton";
import {
  dueDateForUnit,
  formatDueDate,
  formatNaira,
  resolveUnitStatus,
} from "@/lib/dashboard";
import { fetchProperty, fetchPropertyUnitsPage } from "@/lib/api";
import type { Property, Unit } from "@/lib/types";

function PropertyDetailSkeleton() {
  return (
    <section className="dashboard" aria-busy="true" aria-label="Loading property">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">
            <span className="skeleton-bar" style={{ width: 120 }} />
          </p>
          <h1 className="page-title">Property</h1>
          <p className="page-subtitle">
            <span className="skeleton-bar" style={{ width: 200 }} />
          </p>
        </div>
      </header>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Tenant</th>
              <th>Rent</th>
              <th>Due</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <TableSkeleton columns={6} rows={4} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const propertyId = typeof params?.id === "string" ? params.id : "";

  const [property, setProperty] = useState<Property | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!propertyId) {
      setLoading(false);
      setError("Missing property id.");
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setMissing(false);

    (async () => {
      try {
        const [propertyRow, unitsPage] = await Promise.all([
          fetchProperty(propertyId),
          fetchPropertyUnitsPage(propertyId),
        ]);
        if (!active) return;
        setProperty(propertyRow);
        setUnits(unitsPage.items);
        setNextCursor(unitsPage.next_cursor);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load property";
        if (message.toLowerCase().includes("not found")) {
          setMissing(true);
          setProperty(null);
          setUnits([]);
          return;
        }
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [propertyId, reloadKey]);

  async function onLoadMore() {
    if (!nextCursor || loadingMore || !propertyId) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPropertyUnitsPage(propertyId, nextCursor);
      setUnits((current) => [...current, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more units",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return <PropertyDetailSkeleton />;
  }

  if (missing) {
    return (
      <section className="dashboard">
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">Property not found.</p>
          <Link href="/properties" className="btn-primary">
            Back to properties
          </Link>
        </div>
      </section>
    );
  }

  if (error || !property) {
    return (
      <FetchErrorState
        title="Couldn’t load property"
        message={error ?? "Check your connection and try again."}
        onRetry={retry}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">
            <Link href="/properties">Properties</Link>
            <span aria-hidden> / </span>
            {property.name}
          </p>
          <h1 className="page-title">{property.name}</h1>
          <p className="page-subtitle">
            {property.address?.trim() || "No address set"}
            {property.type ? (
              <>
                {" "}
                · <span className="mono-data">{property.type}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link
            href={`/properties/${property.id}/edit`}
            className="btn-secondary"
          >
            Edit property
          </Link>
          <Link
            href={`/properties/${property.id}/units/new`}
            className="btn-primary"
          >
            Add unit
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {units.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No units yet.</p>
          <p className="dashboard-empty-copy">
            Add a flat or shop to track rent.
          </p>
          <Link
            href={`/properties/${property.id}/units/new`}
            className="btn-primary"
          >
            Add unit
          </Link>
        </div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Rent</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => {
                  const status = resolveUnitStatus(
                    unit,
                    unit.transactions ?? [],
                  );
                  const due = dueDateForUnit(
                    unit.due_day,
                    unit.frequency,
                    new Date(),
                    unit.due_month,
                  );
                  return (
                    <tr key={unit.id}>
                      <td>
                        <Link
                          href={`/payments/${unit.id}`}
                          className="table-link"
                        >
                          {unit.label}
                        </Link>
                      </td>
                      <td>{unit.tenant_name?.trim() || "—"}</td>
                      <td className="mono-data">
                        {formatNaira(Number(unit.rent_amount) || 0)}
                        {Number(unit.service_charge_amount) > 0 ? (
                          <p className="table-muted" style={{ margin: "2px 0 0" }}>
                            +{" "}
                            {formatNaira(Number(unit.service_charge_amount) || 0)}{" "}
                            SC
                          </p>
                        ) : null}
                      </td>
                      <td className="mono-data">{formatDueDate(due)}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            status === "PAID"
                              ? "paid"
                              : status === "OVERDUE"
                                ? "overdue"
                                : status === "DUE SOON"
                                  ? "due-soon"
                                  : "pending"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link
                            href={`/properties/units/${unit.id}/edit`}
                            className="table-link"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/payments/${unit.id}`}
                            className="table-link"
                          >
                            Payments
                          </Link>
                          <Link
                            href={`/properties/${propertyId}/units/${unit.id}/tenancy`}
                            className="table-link"
                          >
                            Tenancy
                          </Link>
                          <Link
                            href={`/reminders/${unit.id}`}
                            className="table-link"
                          >
                            Reminders
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <LoadMoreButton
            hasMore={Boolean(nextCursor)}
            loading={loadingMore}
            onLoadMore={() => void onLoadMore()}
          />
        </>
      )}
    </section>
  );
}
