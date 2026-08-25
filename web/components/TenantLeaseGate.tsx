"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { TenantNoLeaseEmpty } from "@/components/TenantNoLeaseEmpty";
import { fetchMyTenancy, type Tenancy } from "@/lib/api";

export type TenantLeaseState =
  | "loading"
  | "error"
  | "none"
  | "pending"
  | "active";

type Props = {
  title: string;
  subtitle: string;
  children: (ctx: { tenancy: Tenancy }) => React.ReactNode;
};

export function TenantLeaseGate({ title, subtitle, children }: Props) {
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTenancy(await fetchMyTenancy());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="dashboard">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <FetchErrorState
        title={`Couldn’t load ${title.toLowerCase()}`}
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!tenancy) {
    return (
      <TenantNoLeaseEmpty
        showModuleChrome
        moduleTitle={title}
        title="No lease"
      />
    );
  }

  if (tenancy.status !== "active") {
    const unitLabel = tenancy.units?.label;
    return (
      <section className="dashboard">
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
        <div className="tenant-module-banner" data-tone="wait" role="status">
          <p className="tenant-module-banner-title">Occupancy not active yet</p>
          <p className="page-subtitle" style={{ margin: 0 }}>
            You’re linked
            {unitLabel ? (
              <>
                {" "}
                to <span className="mono-data">{unitLabel}</span>
              </>
            ) : null}
            . Your landlord still needs to activate occupancy before this
            module is available.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/tenant" className="btn-secondary">
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard">
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
      {children({ tenancy })}
    </section>
  );
}
