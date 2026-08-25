"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  createExpense,
  deleteExpense,
  fetchExpenses,
  type Expense,
} from "@/lib/api";

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchExpenses());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      showToast(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">Money out, repairs, utilities, agency, and more.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Add expense"}
        </button>
      </header>
      {open ? (
        <form className="form-card" onSubmit={onSubmit}>
          <label className="form-label">
            Category
            <select name="category" className="form-input" defaultValue="repairs">
              {CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Amount
            <input name="amount" type="number" min="0" step="0.01" required className="form-input" />
          </label>
          <label className="form-label">
            Paid on
            <input name="paid_on" type="date" className="form-input" />
          </label>
          <label className="form-label">
            Vendor
            <input name="vendor" className="form-input" />
          </label>
          <label className="form-label">
            Notes
            <input name="notes" className="form-input" />
          </label>
          <button type="submit" className="btn-primary" disabled={pending}>
            Save
          </button>
        </form>
      ) : null}
      {loading ? <p className="page-subtitle">Loading…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <ul className="stack-list">
        {items.map((e) => (
          <li key={e.id} className="form-card">
            <p>
              <strong>
                {e.currency} {Number(e.amount).toLocaleString()}
              </strong>{" "}
              <span className="table-muted">
                · {e.category} · {e.paid_on}
              </span>
            </p>
            {e.vendor ? <p className="page-subtitle">{e.vendor}</p> : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                void deleteExpense(e.id).then(load).catch((err) =>
                  showToast(err instanceof Error ? err.message : "Delete failed"),
                )
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {!loading && items.length === 0 ? (
        <p className="table-muted">No expenses yet.</p>
      ) : null}
    </section>
  );
}
