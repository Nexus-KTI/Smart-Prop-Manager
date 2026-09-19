"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { useToast } from "@/components/ToastProvider";
import {
  createExpense,
  deleteExpense,
  fetchExpenses,
  type Expense,
} from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";

const CATS = [
  "repairs",
  "utilities",
  "security",
  "service_charge",
  "tax",
  "agency",
  "other",
] as const;

export function ExpensesClient() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [listCapped, setListCapped] = useState(false);
  const [listLoaded, setListLoaded] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExpenses();
      setItems(data.items);
      setListCapped(data.capped);
      setListLoaded(data.loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
      setItems([]);
      setListCapped(false);
      setListLoaded(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      await createExpense({
        category: String(data.get("category") || "other"),
        amount: Number(data.get("amount") || 0),
        paid_on: String(data.get("paid_on") || "") || undefined,
        vendor: String(data.get("vendor") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
      });
      showToast("Expense recorded");
      event.currentTarget.reset();
      setOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setPending(false);
    }
  }

  if (!loading && error && items.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load expenses"
        message={error}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">
            Money out - repairs, utilities, agency, and more. Pair with Payments
            for money in.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/payments" className="btn-secondary">
            Payments
          </Link>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Add expense"}
          </button>
        </div>
      </header>
      {listCapped && !loading ? (
        <p className="page-subtitle" role="status">
          Showing the {listLoaded} most recent expenses. Older money-out rows
          may not appear here; Reports month totals can also stop at a loaded
          cap.
        </p>
      ) : null}
      {open ? (
        <form className="form-card" onSubmit={onSubmit}>
          <label className="form-field">
            <span className="form-label">Category</span>
            <select name="category" className="form-input" defaultValue="repairs">
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Amount</span>
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              className="form-input"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Paid on</span>
            <input name="paid_on" type="date" className="form-input" />
          </label>
          <label className="form-field">
            <span className="form-label">Vendor</span>
            <input name="vendor" className="form-input" />
          </label>
          <label className="form-field">
            <span className="form-label">Notes</span>
            <input name="notes" className="form-input" />
          </label>
          <button type="submit" className="btn-primary" disabled={pending}>
            Save
          </button>
        </form>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {!loading && items.length === 0 && !open ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No money out yet.</p>
          <p className="dashboard-empty-copy">
            Log repairs, utilities, and other costs that left your account.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setOpen(true)}
          >
            Add expense
          </button>
        </div>
      ) : null}
      {!loading && items.length > 0 ? (
        <ul className="stack-list">
          {items.map((e) => (
            <li key={e.id} className="form-card">
              <p>
                <strong className="mono-data">
                  {formatNaira(Number(e.amount) || 0)}
                </strong>{" "}
                <span className="table-muted">
                  · {e.category} · {e.paid_on || "-"}
                </span>
              </p>
              {e.vendor ? <p className="page-subtitle">{e.vendor}</p> : null}
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  void deleteExpense(e.id)
                    .then(load)
                    .catch((err) =>
                      showToast(
                        err instanceof Error ? err.message : "Delete failed",
                        "error",
                      ),
                    )
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
