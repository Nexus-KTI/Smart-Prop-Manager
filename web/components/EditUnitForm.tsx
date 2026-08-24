"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ToastProvider";
import { fetchMe, deleteUnit, updateUnit } from "@/lib/api";
import {
  contactMatchesChannel,
  tenantContactHint,
  type NotifyChannel,
} from "@/lib/contact-channel";
import type { Unit } from "@/lib/types";

type Props = {
  unit: Unit;
  propertyName: string;
};

export function EditUnitForm({ unit, propertyName }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [channel, setChannel] = useState<NotifyChannel>("sms");
  const [frequency, setFrequency] = useState<Unit["frequency"]>(
    unit.frequency || "monthly",
  );

  useEffect(() => {
    let cancelled = false;
    void fetchMe()
      .then((me) => {
        if (cancelled) return;
        const value = me.notification_channel;
        if (value === "email" || value === "whatsapp" || value === "sms") {
          setChannel(value);
        }
      })
      .catch(() => {
        /* keep default sms */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "").trim();
    const rentAmount = Number(String(form.get("rent_amount") ?? "").trim());
    const nextFrequency = String(form.get("frequency") ?? "monthly").trim() as
      | "daily"
      | "weekly"
      | "monthly"
      | "annual";
    const tenantName = String(form.get("tenant_name") ?? "").trim();
    const tenantContact = String(form.get("tenant_contact") ?? "").trim();
    const dueDayRaw = String(form.get("due_day") ?? "").trim();
    const dueDay = dueDayRaw ? Number(dueDayRaw) : null;
    const dueMonthRaw = String(form.get("due_month") ?? "").trim();
    const serviceRaw = String(form.get("service_charge_amount") ?? "").trim();
    const serviceCharge = serviceRaw ? Number(serviceRaw) : null;
    const termEnd = String(form.get("term_end") ?? "").trim() || null;

    try {
      if (!label) throw new Error("Unit label is required.");
      if (!Number.isFinite(rentAmount) || rentAmount < 0) {
        throw new Error("Enter a valid rent amount.");
      }
      if (
        serviceCharge != null &&
        (!Number.isFinite(serviceCharge) || serviceCharge < 0)
      ) {
        throw new Error("Enter a valid service charge amount.");
      }
      if (!["daily", "weekly", "monthly", "annual"].includes(nextFrequency)) {
        throw new Error("Choose a valid rent frequency.");
      }
      if (
        dueDay != null &&
        (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
      ) {
        throw new Error("Due day must be between 1 and 31.");
      }
      let dueMonth: number | null = null;
      if (nextFrequency === "annual") {
        dueMonth = dueMonthRaw ? Number(dueMonthRaw) : 1;
        if (!Number.isInteger(dueMonth) || dueMonth < 1 || dueMonth > 12) {
          throw new Error("Choose a valid due month.");
        }
        if (dueDay == null) {
          throw new Error("Due day is required for annual rent.");
        }
      }
      if (termEnd && !/^\d{4}-\d{2}-\d{2}$/.test(termEnd)) {
        throw new Error("Term end must be a valid date.");
      }
      if (tenantContact && !contactMatchesChannel(channel, tenantContact)) {
        throw new Error(tenantContactHint(channel));
      }

      await updateUnit(unit.id, {
        label,
        rent_amount: rentAmount,
        frequency: nextFrequency,
        tenant_name: tenantName || null,
        tenant_contact: tenantContact || null,
        due_day: dueDay,
        due_month: dueMonth,
        service_charge_amount: serviceCharge,
        term_end: termEnd,
      });
      showToast("Unit updated.");
      router.push("/properties");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update unit.");
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        `Delete ${unit.label} at ${propertyName}? Payments and reminders for this unit will be removed.`,
      )
    ) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await deleteUnit(unit.id);
      showToast("Unit deleted.");
      router.push("/properties");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete unit.");
      setDeleting(false);
    }
  }

  return (
    <form className="form-card" onSubmit={onSubmit}>
      {error ? <p className="form-error">{error}</p> : null}

      <label className="form-field">
        <span className="form-label">Label</span>
        <input
          className="form-input"
          name="label"
          type="text"
          required
          defaultValue={unit.label}
          placeholder="e.g. Flat 2B"
        />
      </label>

      <div className="form-row">
        <label className="form-field">
          <span className="form-label">Rent amount (₦)</span>
          <div className="amount-input">
            <span className="amount-input-prefix" aria-hidden="true">
              ₦
            </span>
            <input
              className="form-input mono-data"
              name="rent_amount"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              defaultValue={Math.round(Number(unit.rent_amount)) || ""}
              placeholder="e.g. 500000"
            />
          </div>
        </label>

        <label className="form-field">
          <span className="form-label">Frequency</span>
          <select
            className="form-input"
            name="frequency"
            value={frequency}
            required
            onChange={(event) =>
              setFrequency(event.target.value as Unit["frequency"])
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
      </div>

      <label className="form-field">
        <span className="form-label">Tenant name</span>
        <input
          className="form-input"
          name="tenant_name"
          type="text"
          defaultValue={unit.tenant_name ?? ""}
          placeholder="Full name"
        />
      </label>

      <label className="form-field">
        <span className="form-label">Tenant contact</span>
        <input
          className="form-input mono-data"
          name="tenant_contact"
          type="text"
          defaultValue={unit.tenant_contact ?? ""}
          placeholder={
            channel === "email" ? "tenant@example.com" : "e.g. 801 234 5678"
          }
        />
        <span className="form-hint">{tenantContactHint(channel)}</span>
      </label>

      {frequency === "annual" ? (
        <label className="form-field">
          <span className="form-label">Due month</span>
          <select
            className="form-input"
            name="due_month"
            defaultValue={unit.due_month ?? new Date().getMonth() + 1}
            required
          >
            <option value={1}>January</option>
            <option value={2}>February</option>
            <option value={3}>March</option>
            <option value={4}>April</option>
            <option value={5}>May</option>
            <option value={6}>June</option>
            <option value={7}>July</option>
            <option value={8}>August</option>
            <option value={9}>September</option>
            <option value={10}>October</option>
            <option value={11}>November</option>
            <option value={12}>December</option>
          </select>
        </label>
      ) : null}

      <label className="form-field">
        <span className="form-label">Due day</span>
        <input
          className="form-input mono-data"
          name="due_day"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          step={1}
          defaultValue={unit.due_day ?? ""}
          placeholder="1–31"
          required={frequency === "annual"}
        />
        {frequency === "annual" ? (
          <span className="form-hint">
            Day of the month rent is due each year.
          </span>
        ) : null}
      </label>

      <label className="form-field">
        <span className="form-label">Service charge (₦, optional)</span>
        <div className="amount-input">
          <span className="amount-input-prefix" aria-hidden="true">
            ₦
          </span>
          <input
            className="form-input mono-data"
            name="service_charge_amount"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            defaultValue={
              unit.service_charge_amount != null &&
              Number(unit.service_charge_amount) > 0
                ? Math.round(Number(unit.service_charge_amount))
                : ""
            }
            placeholder="Same due day as rent"
          />
        </div>
      </label>

      <label className="form-field">
        <span className="form-label">Term end / renewal</span>
        <input
          className="form-input mono-data"
          name="term_end"
          type="date"
          defaultValue={unit.term_end?.slice(0, 10) ?? ""}
        />
        <span className="form-hint">
          Optional. We email you as this date approaches.
        </span>
      </label>

      <div className="form-actions form-actions-split">
        <button
          className="btn-danger"
          type="button"
          onClick={() => void onDelete()}
          disabled={pending || deleting}
        >
          {deleting ? "Deleting…" : "Delete unit"}
        </button>
        <button className="btn-primary" type="submit" disabled={pending || deleting}>
          {pending ? "Saving…" : "Save unit"}
        </button>
      </div>
    </form>
  );
}
