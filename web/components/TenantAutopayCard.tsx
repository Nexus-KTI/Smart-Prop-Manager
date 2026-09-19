"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  fetchSavedCards,
  updateMyAutopay,
  type SavedPaymentMethod,
  type Tenancy,
} from "@/lib/api";

type Props = {
  tenancy: Tenancy;
  onUpdated: (tenancy: Tenancy) => void;
  onToast: (message: string) => void;
};

export function TenantAutopayCard({ tenancy, onUpdated, onToast }: Props) {
  const [cards, setCards] = useState<SavedPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [methodId, setMethodId] = useState(
    tenancy.autopay_payment_method_id || "",
  );
  const [daysBefore, setDaysBefore] = useState(
    Number(tenancy.autopay_days_before ?? 0),
  );
  const enabled = Boolean(tenancy.autopay_enabled);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await fetchSavedCards());
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  useEffect(() => {
    setMethodId(tenancy.autopay_payment_method_id || "");
    setDaysBefore(Number(tenancy.autopay_days_before ?? 0));
  }, [tenancy.autopay_payment_method_id, tenancy.autopay_days_before]);

  async function save(nextEnabled: boolean) {
    setPending(true);
    try {
      if (nextEnabled && !methodId) {
        onToast("Add and select a card under Settings → Cards first");
        return;
      }
      const updated = await updateMyAutopay({
        enabled: nextEnabled,
        payment_method_id: nextEnabled ? methodId : null,
        days_before: daysBefore,
      });
      onUpdated(updated);
      onToast(nextEnabled ? "Autopay enabled" : "Autopay turned off");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Could not update autopay");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="form-card" style={{ marginTop: 20 }} aria-label="Autopay">
      <p className="form-kicker">Autopay</p>
      <h2 className="page-title" style={{ fontSize: "1.1rem", margin: 0 }}>
        Charge rent on due day
      </h2>
      <p className="page-subtitle" style={{ marginTop: 4 }}>
        Uses a saved Paystack card.{" "}
        <Link href="/tenant/settings" className="table-link">
          Manage cards
        </Link>
      </p>

      {loading ? <p className="table-muted">Loading cards…</p> : null}

      {!loading && cards.length === 0 ? (
        <p className="table-muted">
          No saved cards yet. Add one under Settings → Cards (₦100 verify), then
          enable autopay here.
        </p>
      ) : null}

      {cards.length > 0 ? (
        <>
          <label className="form-field">
            <span className="form-label">Card</span>
            <select
              className="form-input"
              value={methodId}
              disabled={pending || enabled}
              onChange={(e) => setMethodId(e.target.value)}
            >
              <option value="">Select a card</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.card_type || "Card").toUpperCase()} ···· {c.last4 || "????"}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Charge</span>
            <select
              className="form-input"
              value={daysBefore}
              disabled={pending || enabled}
              onChange={(e) => setDaysBefore(Number(e.target.value))}
            >
              <option value={0}>On due day</option>
              <option value={1}>1 day before</option>
              <option value={3}>3 days before</option>
              <option value={7}>7 days before</option>
            </select>
          </label>
          <div className="dashboard-header-actions">
            {enabled ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => void save(false)}
              >
                Turn off autopay
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={pending || !methodId}
                onClick={() => void save(true)}
              >
                Enable autopay
              </button>
            )}
          </div>
          {enabled ? (
            <p className="form-success" role="status" style={{ marginTop: 8 }}>
              Autopay is on
              {methodId
                ? ` · card ···· ${
                    cards.find((c) => c.id === methodId)?.last4 || ""
                  }`
                : ""}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
