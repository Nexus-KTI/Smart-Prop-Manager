"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { UnitRemindersClient } from "@/components/UnitRemindersClient";
import {
  fetchReminderLogPage,
  fetchUnitContext,
  type UnitContext,
} from "@/lib/api";
import type { Reminder } from "@/lib/types";

function UnitRemindersSkeleton() {
  return (
    <section className="dashboard" aria-busy="true" aria-label="Loading reminders">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">
            <span className="skeleton-bar" style={{ width: 160 }} />
          </p>
          <h1 className="page-title">Reminders</h1>
          <p className="page-subtitle">
            <span className="skeleton-bar" style={{ width: 240 }} />
          </p>
        </div>
      </header>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Sent at</th>
            </tr>
          </thead>
          <tbody>
            <TableSkeleton columns={4} rows={5} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function UnitRemindersPage() {
  const params = useParams<{ unitId: string }>();
  const unitId = typeof params?.unitId === "string" ? params.unitId : "";

  const [context, setContext] = useState<UnitContext | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!unitId) {
      setLoading(false);
      setError("Missing unit id.");
      return;
    }

    let active = true;

    setLoading(true);
    setError(null);
    setMissing(false);

    (async () => {
      try {
        const unitContext = await fetchUnitContext(unitId);
        if (!active) return;
        if (!unitContext) {
          setMissing(true);
          setContext(null);
          return;
        }
        const log = await fetchReminderLogPage(unitId);
        if (!active) return;
        setContext(unitContext);
        setReminders(log.items);
        setNextCursor(log.next_cursor);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load reminders",
        );
        setContext(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [unitId, reloadKey]);

  if (loading) {
    return <UnitRemindersSkeleton />;
  }

  if (missing) {
    return (
      <section className="dashboard">
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">Unit not found.</p>
          <p className="dashboard-empty-copy">
            It may be gone or you don&apos;t have access.
          </p>
          <Link href="/reminders" className="btn-primary">
            Back to reminders
          </Link>
        </div>
      </section>
    );
  }

  if (error || !context) {
    return (
      <FetchErrorState
        title="Couldn’t load reminders"
        message={error ?? "Check your connection and try again."}
        onRetry={retry}
      />
    );
  }

  const rentAmount = Number(context.unit.rent_amount) || 0;

  return (
    <UnitRemindersClient
      unitId={unitId}
      unitLabel={context.unit.label}
      propertyName={context.propertyName}
      rentAmount={rentAmount}
      tenantName={context.unit.tenant_name}
      tenantContact={context.unit.tenant_contact}
      reminders={reminders}
      initialNextCursor={nextCursor}
    />
  );
}
