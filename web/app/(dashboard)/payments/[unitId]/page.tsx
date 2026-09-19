"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import {
  fetchPaymentHistoryPage,
  fetchUnitContext,
  type UnitContext,
} from "@/lib/api";
import type { Transaction } from "@/lib/types";

function UnitPaymentsSkeleton() {
  return (
    <section className="dashboard" aria-busy="true" aria-label="Loading payments">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">
            <span className="skeleton-bar" style={{ width: 160 }} />
          </p>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            <span className="skeleton-bar" style={{ width: 220 }} />
          </p>
        </div>
      </header>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            <TableSkeleton columns={5} rows={5} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Client-only: avoids intermittent route 500s if Paystack’s bundle touches `window`
// during SSR of the payments module graph.
const UnitPaymentsClient = dynamic(
  () =>
    import("@/components/UnitPaymentsClient").then(
      (mod) => mod.UnitPaymentsClient,
    ),
  { ssr: false, loading: () => <UnitPaymentsSkeleton /> },
);

export default function UnitPaymentsPage() {
  const params = useParams<{ unitId: string }>();
  const unitId = typeof params?.unitId === "string" ? params.unitId : "";

  const [context, setContext] = useState<UnitContext | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestSeq = useRef(0);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!unitId) {
      setLoading(false);
      setError("Missing unit id.");
      setContext(null);
      setMissing(false);
      setTransactions([]);
      setNextCursor(null);
      return;
    }

    const seq = ++requestSeq.current;

    setLoading(true);
    setError(null);
    setMissing(false);

    (async () => {
      try {
        const unitContext = await fetchUnitContext(unitId);
        if (seq !== requestSeq.current) return;

        if (!unitContext) {
          setMissing(true);
          setContext(null);
          setTransactions([]);
          setNextCursor(null);
          return;
        }

        const history = await fetchPaymentHistoryPage(unitId);
        if (seq !== requestSeq.current) return;

        // Empty history is success, show the client with the empty-table copy.
        setContext(unitContext);
        setTransactions(history.items);
        setNextCursor(history.next_cursor);
        setError(null);
        setMissing(false);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(
          err instanceof Error ? err.message : "Failed to load payments",
        );
        setContext(null);
        setTransactions([]);
        setNextCursor(null);
        setMissing(false);
      } finally {
        // Always clear skeleton for the latest request (fixes Strict Mode races
        // that left loading=true forever when an older effect was cancelled).
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    })();
  }, [unitId, reloadKey]);

  if (loading) {
    return <UnitPaymentsSkeleton />;
  }

  if (missing) {
    return (
      <section className="dashboard">
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">Unit not found.</p>
          <p className="dashboard-empty-copy">
            It may be gone or you don&apos;t have access.
          </p>
          <Link href="/properties" className="btn-primary">
            Back to properties
          </Link>
        </div>
      </section>
    );
  }

  if (error || !context) {
    return (
      <FetchErrorState
        title="Couldn’t load payments"
        message={error ?? "Check your connection and try again."}
        onRetry={retry}
      />
    );
  }

  const rentAmount = Number(context.unit.rent_amount) || 0;
  const serviceChargeAmount = Number(context.unit.service_charge_amount) || 0;

  return (
    <UnitPaymentsClient
      unitId={unitId}
      unitLabel={context.unit.label}
      propertyName={context.propertyName}
      propertyId={context.unit.property_id}
      rentAmount={rentAmount}
      serviceChargeAmount={serviceChargeAmount}
      termEnd={context.unit.term_end}
      frequency={context.unit.frequency || "monthly"}
      dueDay={context.unit.due_day}
      dueMonth={context.unit.due_month}
      tenantName={context.unit.tenant_name}
      tenantContact={context.unit.tenant_contact}
      paystackPublicKey={process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? ""}
      transactions={transactions}
      initialNextCursor={nextCursor}
    />
  );
}
