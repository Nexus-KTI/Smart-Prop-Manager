"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { useToast } from "@/components/ToastProvider";
import {
  confirmPaystackPayment,
  createPendingPaystackPayment,
  fetchPaymentHistoryPage,
  recordManualPayment,
  trackRenewalBannerViewed,
} from "@/lib/api";
import {
  chargeStatusTone,
  chargeTypeLabel,
  daysUntilTermEnd,
  formatDueDate,
  formatNaira,
  parseTermEnd,
  resolveChargeStatus,
} from "@/lib/dashboard";
import type { ChargeType, Transaction, Unit } from "@/lib/types";

type Props = {
  unitId: string;
  unitLabel: string;
  propertyName: string;
  propertyId?: string | null;
  rentAmount: number;
  serviceChargeAmount: number;
  termEnd?: string | null;
  frequency: Unit["frequency"];
  dueDay?: number | null;
  dueMonth?: number | null;
  tenantName?: string | null;
  tenantContact?: string | null;
  paystackPublicKey: string;
  transactions: Transaction[];
  initialNextCursor?: string | null;
};

function statusTone(status: string): string {
  if (status === "paid") return "paid";
  if (status === "overdue" || status === "failed") return "overdue";
  return "pending";
}

function formatWhen(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function checkoutEmail(tenantContact?: string | null, unitId?: string): string {
  const contact = tenantContact?.trim() ?? "";
  if (contact.includes("@")) return contact;
  return `tenant+${unitId}@smartprop.local`;
}

function defaultAmountForCharge(
  chargeType: ChargeType,
  rentAmount: number,
  serviceChargeAmount: number,
): number {
  if (chargeType === "service_charge") return serviceChargeAmount || 0;
  if (chargeType === "other") return 0;
  return rentAmount || 0;
}

export function UnitPaymentsClient({
  unitId,
  unitLabel,
  propertyName,
  propertyId = null,
  rentAmount,
  serviceChargeAmount,
  termEnd,
  frequency,
  dueDay,
  dueMonth,
  tenantName,
  tenantContact,
  paystackPublicKey,
  transactions: initialTransactions,
  initialNextCursor = null,
}: Props) {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState(initialTransactions);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualFormKey, setManualFormKey] = useState(0);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualPending, setManualPending] = useState(false);
  const [chargeType, setChargeType] = useState<ChargeType>("rent");
  const [paystackError, setPaystackError] = useState<string | null>(null);
  const [pendingPaystack, startPaystackTransition] = useTransition();
  const manualSubmitLock = useRef(false);

  const unitForStatus: Unit = useMemo(
    () => ({
      id: unitId,
      property_id: "",
      label: unitLabel,
      rent_amount: rentAmount,
      frequency,
      due_day: dueDay ?? null,
      due_month: dueMonth ?? null,
      service_charge_amount: serviceChargeAmount || null,
      term_end: termEnd ?? null,
    }),
    [
      unitId,
      unitLabel,
      rentAmount,
      frequency,
      dueDay,
      dueMonth,
      serviceChargeAmount,
      termEnd,
    ],
  );

  const rentStatus = resolveChargeStatus(unitForStatus, transactions, "rent");
  const hasServiceCharge = serviceChargeAmount > 0;
  const serviceStatus = hasServiceCharge
    ? resolveChargeStatus(unitForStatus, transactions, "service_charge")
    : null;

  const renewalDays = daysUntilTermEnd(unitForStatus);
  const renewalDate = parseTermEnd(termEnd);
  const editUnitHref = `/properties/units/${unitId}/edit`;
  const tenancyHref =
    propertyId != null && propertyId !== ""
      ? `/properties/${propertyId}/units/${unitId}/tenancy`
      : null;

  function resetManualForm() {
    setManualOpen(false);
    setManualError(null);
    setChargeType("rent");
    setManualFormKey((key) => key + 1);
  }

  async function refreshHistory() {
    const page = await fetchPaymentHistoryPage(unitId);
    setTransactions(page.items);
    setNextCursor(page.next_cursor);
  }

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPaymentHistoryPage(unitId, nextCursor);
      setTransactions((current) => [...current, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not load more payments.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualSubmitLock.current || manualPending) return;

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const amount = Number(String(form.get("amount") ?? "").trim());
    const paymentReference = String(
      form.get("payment_reference") ?? "",
    ).trim();
    const selectedType = String(form.get("charge_type") ?? chargeType).trim() as ChargeType;
    const chargeLabel = String(form.get("charge_label") ?? "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setManualError("Enter a valid payment amount.");
      return;
    }
    if (selectedType === "other" && !chargeLabel) {
      setManualError("Add a label for this other charge.");
      return;
    }

    manualSubmitLock.current = true;
    setManualError(null);
    setManualPending(true);

    try {
      const saved = await recordManualPayment({
        unit_id: unitId,
        amount,
        payment_reference: paymentReference || null,
        charge_type: selectedType,
        charge_label: selectedType === "other" ? chargeLabel : null,
      });

      formEl.reset();
      resetManualForm();
      setPaystackError(null);

      setTransactions((current) => {
        if (current.some((row) => row.id === saved.id)) return current;
        return [saved, ...current];
      });
      showToast("Payment recorded");

      try {
        await refreshHistory();
      } catch {
        showToast("Payment saved — refresh the page if it doesn’t appear yet.");
      }
    } catch (err) {
      setManualError(
        err instanceof Error ? err.message : "Could not record payment.",
      );
    } finally {
      manualSubmitLock.current = false;
      setManualPending(false);
    }
  }

  function handlePaystack() {
    setPaystackError(null);

    if (!paystackPublicKey) {
      setPaystackError("Missing NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY.");
      return;
    }

    const type = chargeType === "other" ? "rent" : chargeType;
    if (type === "service_charge" && !hasServiceCharge) {
      setPaystackError(
        "Set a service charge amount on Edit unit before collecting it with Paystack.",
      );
      return;
    }
    const amount =
      type === "service_charge" ? serviceChargeAmount : rentAmount;
    const amountKobo = Math.round(amount * 100);
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      setPaystackError(
        type === "service_charge"
          ? "Service charge must be greater than zero."
          : "Rent amount must be greater than zero.",
      );
      return;
    }

    startPaystackTransition(async () => {
      try {
        const pending = await createPendingPaystackPayment({
          unit_id: unitId,
          amount,
          charge_type: type,
        });

        const { default: PaystackPop } = await import("@paystack/inline-js");
        const paystack = new PaystackPop();
        paystack.newTransaction({
          key: paystackPublicKey,
          email: checkoutEmail(tenantContact, unitId),
          amount: amountKobo,
          currency: "NGN",
          metadata: {
            unit_id: unitId,
            transaction_id: pending.id,
            charge_type: type,
            custom_fields: [
              {
                display_name: "Unit",
                variable_name: "unit",
                value: `${propertyName} · ${unitLabel}`,
              },
              {
                display_name: "Charge",
                variable_name: "charge",
                value: chargeTypeLabel(type),
              },
            ],
          },
          onSuccess: (transaction) => {
            startPaystackTransition(async () => {
              try {
                await confirmPaystackPayment({
                  unit_id: unitId,
                  reference: transaction.reference,
                  transaction_id: pending.id,
                });
                await refreshHistory();
                showToast("Payment recorded");
              } catch (err) {
                setPaystackError(
                  err instanceof Error
                    ? err.message
                    : "Could not confirm payment.",
                );
              }
            });
          },
          onCancel: () => {
            setPaystackError("Checkout was cancelled.");
          },
          onError: (error) => {
            setPaystackError(error.message || "Paystack checkout failed.");
          },
        });
      } catch (err) {
        setPaystackError(
          err instanceof Error ? err.message : "Could not start Paystack payment.",
        );
      }
    });
  }

  const renewalCopy =
    renewalDays == null || !renewalDate
      ? null
      : renewalDays < 0
        ? `Renewal overdue — term ended ${formatDueDate(renewalDate)}`
        : renewalDays === 0
          ? `Renewal due today (${formatDueDate(renewalDate)})`
          : `Renewal due in ${renewalDays} day${renewalDays === 1 ? "" : "s"} (${formatDueDate(renewalDate)})`;

  useEffect(() => {
    if (!renewalCopy) return;
    const key = `spm-renewal-banner-viewed:${unitId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* private mode — still attempt once via ref below */
    }
    void trackRenewalBannerViewed(unitId);
  }, [renewalCopy, unitId]);

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">
            <Link href="/properties">Properties</Link>
            <span aria-hidden> / </span>
            {propertyName} · {unitLabel}
          </p>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Log cash or transfer, or collect online — rent and other charges
            share this history.
            {tenantName ? ` · ${tenantName}` : ""}
            {tenancyHref ? (
              <>
                {" · "}
                <Link href={tenancyHref} className="table-link">
                  Tenancy dossier
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="dashboard-header-actions">
          {!manualOpen ? (
            <label className="form-field paystack-charge-field">
              <span className="form-label">Paystack charge</span>
              <select
                className="form-input"
                value={chargeType === "other" ? "rent" : chargeType}
                disabled={pendingPaystack}
                onChange={(event) => {
                  setChargeType(event.target.value as ChargeType);
                  setPaystackError(null);
                }}
                aria-label="Charge to collect with Paystack"
              >
                <option value="rent">Rent</option>
                <option value="service_charge">Service charge</option>
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="btn-outline"
            onClick={handlePaystack}
            disabled={pendingPaystack || manualOpen}
          >
            {pendingPaystack ? "Confirming…" : "Pay with Paystack"}
          </button>
          {!manualOpen ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setManualOpen(true)}
            >
              Record Manual Payment
            </button>
          ) : null}
        </div>
      </header>

      {renewalCopy ? (
        <p
          className="unit-renewal-banner"
          data-tone={renewalDays != null && renewalDays < 0 ? "alert" : "accent"}
          role="status"
        >
          {renewalCopy}
        </p>
      ) : null}

      <div className="unit-charge-lines" aria-label="Charge status">
        <div className="unit-charge-line">
          <div className="unit-charge-line-meta">
            <strong>Rent</strong>
            <span className="mono-data">{formatNaira(rentAmount)}</span>
          </div>
          <span className={`status-badge ${chargeStatusTone(rentStatus)}`}>
            {rentStatus}
          </span>
        </div>
        <div className="unit-charge-line">
          <div className="unit-charge-line-meta">
            <strong>Service charge</strong>
            <span className="mono-data">
              {hasServiceCharge ? (
                formatNaira(serviceChargeAmount)
              ) : (
                <Link href={editUnitHref} className="table-link">
                  Set amount
                </Link>
              )}
            </span>
          </div>
          {serviceStatus ? (
            <span className={`status-badge ${chargeStatusTone(serviceStatus)}`}>
              {serviceStatus}
            </span>
          ) : (
            <span className="status-badge pending">NOT SET</span>
          )}
        </div>
      </div>

      {paystackError ? (
        <p className="form-error">
          {paystackError}{" "}
          {!hasServiceCharge && chargeType === "service_charge" ? (
            <Link href={editUnitHref} className="table-link">
              Edit unit
            </Link>
          ) : null}
        </p>
      ) : null}
      {manualError ? <p className="form-error">{manualError}</p> : null}

      {manualOpen ? (
        <form
          key={manualFormKey}
          className="form-card manual-payment-card"
          onSubmit={handleManualSubmit}
          aria-busy={manualPending}
        >
          <label className="form-field">
            <span className="form-label">Charge</span>
            <select
              className="form-input"
              name="charge_type"
              value={chargeType}
              disabled={manualPending}
              onChange={(event) => {
                const next = event.target.value as ChargeType;
                setChargeType(next);
              }}
            >
              <option value="rent">Rent</option>
              <option value="service_charge">Service charge</option>
              <option value="other">Other</option>
            </select>
            {!hasServiceCharge && chargeType === "service_charge" ? (
              <span className="form-hint">
                Optional:{" "}
                <Link href={editUnitHref} className="table-link">
                  set a recurring amount
                </Link>{" "}
                on the unit to track status. You can still log any amount below.
              </span>
            ) : null}
          </label>
          {chargeType === "other" ? (
            <label className="form-field">
              <span className="form-label">Label</span>
              <input
                className="form-input"
                name="charge_label"
                type="text"
                required
                placeholder="e.g. Generator fuel levy"
                disabled={manualPending}
              />
            </label>
          ) : null}
          <label className="form-field">
            <span className="form-label">Amount</span>
            <input
              className="form-input mono-data"
              name="amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              required
              key={`amount-${chargeType}-${manualFormKey}`}
              defaultValue={
                defaultAmountForCharge(
                  chargeType,
                  rentAmount,
                  serviceChargeAmount,
                ) || ""
              }
              disabled={manualPending}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Bank / cash reference</span>
            <input
              className="form-input mono-data"
              name="payment_reference"
              type="text"
              placeholder="Optional transfer ref"
              disabled={manualPending}
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={manualPending}
              onClick={() => {
                if (manualPending) return;
                resetManualForm();
              }}
            >
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={manualPending}>
              {manualPending ? "Saving…" : "Save payment"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Charge</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="table-empty">
                  No payments yet. Record one above to start this log.
                </td>
              </tr>
            ) : (
              transactions.map((txn) => {
                const receiptUrl = txn.receipt_url?.trim() ?? "";
                const hasReceipt =
                  txn.status === "paid" && /^https?:\/\//i.test(receiptUrl);

                return (
                  <tr key={txn.id}>
                    <td className="mono-data">
                      {formatWhen(txn.paid_at || txn.created_at)}
                    </td>
                    <td>
                      {chargeTypeLabel(txn.charge_type, txn.charge_label)}
                    </td>
                    <td className="mono-data">
                      {formatNaira(Number(txn.amount) || 0)}
                    </td>
                    <td>{txn.method || "-"}</td>
                    <td>
                      <span className={`status-badge ${statusTone(txn.status)}`}>
                        {txn.status}
                      </span>
                    </td>
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
              })
            )}
          </tbody>
        </table>
      </div>

      <LoadMoreButton
        hasMore={Boolean(nextCursor)}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </section>
  );
}
