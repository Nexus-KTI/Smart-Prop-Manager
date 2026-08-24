"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { FetchErrorState } from "@/components/FetchErrorState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { fetchPortfolioPaymentsPage } from "@/lib/api";
import { chargeTypeLabel, formatNaira } from "@/lib/dashboard";
import type { PortfolioPayment } from "@/lib/types";

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function unitLabel(row: PortfolioPayment): string {
  const property = (row.property_name || "").trim();
  const unit = (row.unit_label || "").trim();
  if (property && unit) return `${property} · ${unit}`;
  return property || unit || "Unit";
}

export default function PaymentsPage() {
  const [items, setItems] = useState<PortfolioPayment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadPage = useCallback(async (cursor?: string | null) => {
    const page = await fetchPortfolioPaymentsPage(cursor);
    setItems((current) => (cursor ? [...current, ...page.items] : page.items));
    setNextCursor(page.next_cursor);
  }, []);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        await loadPage(null);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load money-in feed",
          );
          setItems([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadPage, reloadKey]);

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextCursor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load more payments",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (!loading && error && items.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load money in"
        message={error}
        onRetry={retry}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Recent money in across your units. Open a unit to record a payment.
          </p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Charge</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              <TableSkeleton columns={7} rows={6} />
            </tbody>
          </table>
        </div>
      ) : items.length === 0 ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No money in yet.</p>
          <p className="dashboard-empty-copy">
            When you log cash, transfer, or Paystack on a unit, it shows up here.
          </p>
          <Link href="/properties" className="btn-primary">
            Go to properties
          </Link>
        </div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Charge</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const receiptUrl = row.receipt_url?.trim() ?? "";
                  const hasReceipt = /^https?:\/\//i.test(receiptUrl);
                  return (
                    <tr key={row.id}>
                      <td className="mono-data">
                        {formatWhen(row.paid_at || row.created_at)}
                      </td>
                      <td>
                        {row.unit_id ? (
                          <Link
                            href={`/payments/${row.unit_id}`}
                            className="table-link"
                          >
                            {unitLabel(row)}
                          </Link>
                        ) : (
                          unitLabel(row)
                        )}
                      </td>
                      <td>{row.tenant_name?.trim() || "—"}</td>
                      <td>
                        {chargeTypeLabel(row.charge_type, row.charge_label)}
                      </td>
                      <td className="mono-data">
                        {formatNaira(Number(row.amount) || 0)}
                      </td>
                      <td>{row.method || "—"}</td>
                      <td>
                        {hasReceipt ? (
                          <a
                            href={receiptUrl}
                            className="table-link"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download receipt
                          </a>
                        ) : (
                          "—"
                        )}
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
