"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  createUnitFee,
  fetchUnitFees,
  openApplicationInvite,
  updateFeeStatus,
  type ScheduledFee,
} from "@/lib/api";
import { FEE_STATUS_LABELS, labelOrTitle } from "@/lib/labels";

export function UnitFeesAndApplyCard({ unitId }: { unitId: string }) {
  const { showToast } = useToast();
  const [fees, setFees] = useState<ScheduledFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyUrl, setApplyUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFees(await fetchUnitFees(unitId));
    } catch {
      setFees([]);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onApply() {
    try {
      const res = await openApplicationInvite(unitId);
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}${res.apply_path}`
          : res.apply_url;
      setApplyUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        showToast("Apply link copied");
      } catch {
        showToast("Apply link created");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create apply link");
    }
  }

  async function onFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await createUnitFee(unitId, {
        label: String(data.get("label") || "").trim(),
        amount: Number(data.get("amount") || 0),
        due_on: String(data.get("due_on") || ""),
        charge_type: String(data.get("charge_type") || "other"),
      });
      showToast("Fee scheduled");
      event.currentTarget.reset();
      setOpen(false);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create fee");
    }
  }

  return (
    <div className="form-card">
      <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
        Leasing & fees
      </h2>
      <p className="page-subtitle">
        Share an apply link for vacant interest, or schedule a non-rent fee the
        tenant can see.
      </p>
      <div className="dashboard-header-actions">
        <button type="button" className="btn-secondary" onClick={() => void onApply()}>
          Invite to apply
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Close fee form" : "Add fee"}
        </button>
      </div>
      {applyUrl ? <p className="mono-data">{applyUrl}</p> : null}
      {open ? (
        <form onSubmit={onFee} className="stack-form">
          <label className="form-label">
            Label
            <input name="label" required className="form-input" placeholder="Service charge" />
          </label>
          <label className="form-label">
            Amount
            <input name="amount" type="number" min="0" step="0.01" required className="form-input" />
          </label>
          <label className="form-label">
            Due
            <input name="due_on" type="date" required className="form-input" />
          </label>
          <label className="form-label">
            Type
            <select name="charge_type" className="form-input" defaultValue="other">
              <option value="service_charge">Service charge</option>
              <option value="other">Other</option>
            </select>
          </label>
          <button type="submit" className="btn-primary">
            Save fee
          </button>
        </form>
      ) : null}
      {loading ? <p className="table-muted">Loading fees…</p> : null}
      <ul className="stack-list">
        {fees.map((f) => (
          <li key={f.id}>
            <span>
              {f.label} · {f.currency} {Number(f.amount).toLocaleString()} · due{" "}
              {f.due_on} · {labelOrTitle(FEE_STATUS_LABELS, f.status)}
            </span>
            {f.status === "due" ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  void updateFeeStatus(f.id, "paid")
                    .then(load)
                    .catch((err) =>
                      showToast(err instanceof Error ? err.message : "Update failed"),
                    )
                }
              >
                Mark paid
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
