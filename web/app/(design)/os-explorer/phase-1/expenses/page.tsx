"use client";

import Link from "next/link";
import { useState } from "react";

import { WireframeNote } from "../../_components/ui";
import { formatNaira, mockExpenses } from "../../mock/data";

export default function Phase1ExpensesPage() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(mockExpenses);

  return (
    <>
      <p className="osx-meta">
        <Link href="/os-explorer/phase-1">Phase 1</Link> · Expenses · money out
      </p>
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Expenses</h1>
          <p className="page-subtitle">
            Money out - repairs, utilities, agency, and more. Pair with Payments
            for money in.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/os-explorer/phase-1/payments" className="btn-secondary">
            Payments
          </Link>
          <Link href="/os-explorer/phase-1/help" className="btn-secondary">
            Help
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

      {open ? (
        <form
          className="form-card"
          style={{ maxWidth: 420, marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setItems((prev) => [
              ...prev,
              {
                id: `exp-${prev.length + 1}`,
                category: String(fd.get("category") || "repairs"),
                amount: Number(fd.get("amount") || 0),
                paidOn: String(fd.get("paid_on") || "-"),
                vendor: String(fd.get("vendor") || ""),
              },
            ]);
            setOpen(false);
            e.currentTarget.reset();
          }}
        >
          <label className="form-label">
            Category
            <select name="category" className="form-input" defaultValue="repairs">
              <option value="repairs">repairs</option>
              <option value="utilities">utilities</option>
              <option value="agency">agency</option>
              <option value="other">other</option>
            </select>
          </label>
          <label className="form-label">
            Amount
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              className="form-input"
            />
          </label>
          <label className="form-label">
            Paid on
            <input name="paid_on" type="date" className="form-input" />
          </label>
          <label className="form-label">
            Vendor
            <input name="vendor" className="form-input" />
          </label>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </form>
      ) : null}

      {items.length === 0 && !open ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No money out yet.</p>
          <p className="dashboard-empty-copy">
            Log repairs, utilities, agency fees, and other costs here so books
            match what left your account.
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

      {items.length > 0 ? (
        <ul className="stack-list">
          {items.map((e) => (
            <li key={e.id} className="form-card">
              <p>
                <strong className="mono-data">{formatNaira(e.amount)}</strong>{" "}
                <span className="table-muted">
                  · {e.category} · {e.paidOn}
                </span>
              </p>
              {e.vendor ? <p className="page-subtitle">{e.vendor}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <WireframeNote>
        Help tip “Where do I log money out?” → Expenses. Header Payments pairs
        money in / money out.
      </WireframeNote>
    </>
  );
}
