"use client";

import { useCallback, useEffect, useState } from "react";

import {
  confirmSavedCard,
  deleteSavedCard,
  fetchSavedCards,
  type SavedPaymentMethod,
} from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

type Props = {
  paystackPublicKey: string;
  onToast: (message: string) => void;
};

export function PaymentCardsPanel({ paystackPublicKey, onToast }: Props) {
  const [items, setItems] = useState<SavedPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchSavedCards());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load cards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCard() {
    if (!paystackPublicKey) {
      setError("Paystack is not configured (missing public key).");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) {
        throw new Error("Add an email on Profile before saving a card");
      }

      const { default: PaystackPop } = await import("@paystack/inline-js");
      const paystack = new PaystackPop();
      await new Promise<void>((resolve, reject) => {
        paystack.newTransaction({
          key: paystackPublicKey,
          email,
          amount: 10000, // ₦100 verification charge (kobo)
          currency: "NGN",
          metadata: { purpose: "save_card" },
          onSuccess: (response: { reference?: string }) => {
            void (async () => {
              try {
                const ref = response.reference;
                if (!ref) throw new Error("Missing Paystack reference");
                await confirmSavedCard(ref);
                onToast("Card saved");
                await load();
                resolve();
              } catch (err) {
                reject(err);
              }
            })();
          },
          onCancel: () => resolve(),
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save card");
    } finally {
      setPending(false);
    }
  }

  async function removeCard(id: string) {
    setPending(true);
    setError(null);
    try {
      await deleteSavedCard(id);
      onToast("Card removed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove card");
    } finally {
      setPending(false);
    }
  }

  const header = (
    <div className="settings-section">
      <p className="settings-section-title">My cards</p>
      <p className="settings-section-lede">
        Save a card for faster Paystack rent payments. Adding a card charges a
        small ₦100 verification that Paystack may refund per your bank rules -
        it is not rent.
      </p>
    </div>
  );

  if (!loading && items.length === 0) {
    return (
      <div className="dashboard-empty" role="tabpanel" aria-label="Cards">
        {error ? <p className="form-error">{error}</p> : null}
        <p className="dashboard-empty-title mono-data">No cards yet.</p>
        <p className="dashboard-empty-copy">
          Save a card for faster Paystack rent pay (₦100 verification, not rent).
        </p>
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !paystackPublicKey}
          onClick={() => void addCard()}
        >
          {pending ? "Working…" : "Add new card"}
        </button>
      </div>
    );
  }

  return (
    <div className="form-card settings-card" role="tabpanel" aria-label="Cards">
      {header}
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="page-subtitle">Loading cards…</p> : null}

      {items.length > 0 ? (
        <ul className="settings-session-list">
          {items.map((card) => (
            <li key={card.id} className="settings-session-row">
              <span>
                <strong>
                  {(card.card_type || "Card").toUpperCase()} ···· {card.last4 || "????"}
                </strong>
                {card.exp_month && card.exp_year ? (
                  <span className="table-muted">
                    {" "}
                    · Expires {card.exp_month}/{card.exp_year}
                  </span>
                ) : null}
                {card.bank ? (
                  <span className="table-muted"> · {card.bank}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="table-link"
                disabled={pending}
                onClick={() => void removeCard(card.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !paystackPublicKey}
          onClick={() => void addCard()}
          style={{ marginTop: 12 }}
        >
          {pending ? "Working…" : "Add new card"}
        </button>
      ) : null}
    </div>
  );
}
