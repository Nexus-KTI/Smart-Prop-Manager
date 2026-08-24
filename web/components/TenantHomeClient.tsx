"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  createPendingPaystackPayment,
  confirmPaystackPayment,
  fetchMyTenancy,
  type Tenancy,
} from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";

export function TenantHomeClient() {
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

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

  const unit = tenancy?.units;
  const propertyName = useMemo(() => {
    const props = unit?.properties;
    if (Array.isArray(props)) return props[0]?.name || "";
    return props?.name || "";
  }, [unit]);

  const rent = Number(unit?.rent_amount || 0);
  const sc = Number(unit?.service_charge_amount || 0);
  const due = rent + sc;

  async function payRent() {
    if (!tenancy?.unit_id || due <= 0) return;
    setPaying(true);
    setError(null);
    try {
      const pending = await createPendingPaystackPayment({
        unit_id: tenancy.unit_id,
        amount: due,
        charge_type: "rent",
      });
      const txn = Array.isArray(pending) ? pending[0] : pending;
      const txnId = txn?.id;
      const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
      if (!publicKey || !txnId) {
        throw new Error("Paystack is not configured");
      }
      const { default: PaystackPop } = await import("@paystack/inline-js");
      const paystack = new PaystackPop();
      paystack.newTransaction({
        key: publicKey,
        email: "tenant@nexora.pay",
        amount: Math.round(due * 100),
        currency: "NGN",
        metadata: { transaction_id: txnId, unit_id: tenancy.unit_id },
        onSuccess: (response: { reference: string }) => {
          void (async () => {
            try {
              await confirmPaystackPayment({
                unit_id: tenancy.unit_id,
                reference: response.reference,
                transaction_id: txnId,
              });
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Confirm failed");
            } finally {
              setPaying(false);
            }
          })();
        },
        onCancel: () => setPaying(false),
        onError: (err: { message?: string }) => {
          setError(err?.message || "Paystack checkout failed");
          setPaying(false);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pay failed");
      setPaying(false);
    }
  }

  if (loading) return <p className="page-subtitle">Loading…</p>;
  if (error && !tenancy) {
    return (
      <FetchErrorState
        title="Couldn’t load your rent"
        message={error}
        onRetry={() => void load()}
      />
    );
  }
  if (!tenancy) {
    return (
      <section className="dashboard">
        <h1 className="page-title">Your rent</h1>
        <p className="page-subtitle">
          No active tenancy linked yet. Use your invite claim link after sign-in.
        </p>
        <Link href="/tenant/claim" className="btn-secondary">
          Claim invite
        </Link>
      </section>
    );
  }

  return (
    <section className="dashboard">
      <p className="form-kicker">Tenant view</p>
      <h1 className="page-title">Your rent</h1>
      <p className="page-subtitle">
        {tenancy.tenant_name || "Tenant"}
        {unit?.label ? ` · ${unit.label}` : ""}
        {propertyName ? ` · ${propertyName}` : ""}
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="stat-row">
        <div className="stat-block">
          <p className="stat-label">Amount due</p>
          <p className="stat-value mono-data">{formatNaira(due)}</p>
          <p className="table-muted">
            {sc > 0 ? "Rent + service charge" : "Rent"}
          </p>
        </div>
      </div>
      <div className="dashboard-header-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={paying || due <= 0}
          onClick={() => void payRent()}
        >
          Pay rent
        </button>
        <Link href="/tenant/documents" className="btn-secondary">
          Your documents
        </Link>
        <Link href="/tenant/receipts" className="btn-secondary">
          Receipts
        </Link>
      </div>
    </section>
  );
}
