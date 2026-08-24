"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  fetchMyTenancy,
  fetchPaymentHistoryPage,
} from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";
import type { Transaction } from "@/lib/types";

export default function TenantReceiptsPage() {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenancy = await fetchMyTenancy();
      if (!tenancy?.unit_id) {
        setRows([]);
        return;
      }
      const page = await fetchPaymentHistoryPage(tenancy.unit_id);
      setRows(page.items.filter((t) => t.status === "paid"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="page-subtitle">Loading receipts…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load receipts"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <h1 className="page-title">Receipts</h1>
      <p className="page-subtitle">
        Paid history for your unit. Same ledger as your landlord.
      </p>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Method</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="table-muted">
                  No payments yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono-data">{formatNaira(Number(row.amount) || 0)}</td>
                  <td>{row.method}</td>
                  <td>
                    {row.receipt_url ? (
                      <a
                        href={row.receipt_url}
                        className="table-link"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: 16 }}>
        <Link href="/tenant" className="table-link">
          Back to your rent
        </Link>
      </p>
    </section>
  );
}
