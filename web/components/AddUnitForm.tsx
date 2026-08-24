"use client";

import { useActionState, useState } from "react";

import {
  createUnitAction,
  type FormState,
} from "@/app/(dashboard)/properties/actions";

const initialState: FormState = {};

export function AddUnitForm({ propertyId }: { propertyId: string }) {
  const action = createUnitAction.bind(null, propertyId);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [frequency, setFrequency] = useState("monthly");

  return (
    <form className="form-card" action={formAction}>
      {state.error ? <p className="form-error">{state.error}</p> : null}

      <label className="form-field">
        <span className="form-label">Label</span>
        <input
          className="form-input"
          name="label"
          type="text"
          required
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
            onChange={(event) => setFrequency(event.target.value)}
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
          placeholder="Full name"
          autoComplete="name"
        />
      </label>

      <label className="form-field">
        <span className="form-label">Tenant contact</span>
        <input
          className="form-input mono-data"
          name="tenant_contact"
          type="text"
          placeholder="Phone, WhatsApp, or email"
          autoComplete="tel"
        />
      </label>

      {frequency === "annual" ? (
        <label className="form-field">
          <span className="form-label">Due month</span>
          <select
            className="form-input"
            name="due_month"
            defaultValue={new Date().getMonth() + 1}
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
            placeholder="Same due day as rent"
          />
        </div>
      </label>

      <label className="form-field">
        <span className="form-label">Term end / renewal</span>
        <input className="form-input mono-data" name="term_end" type="date" />
        <span className="form-hint">
          Optional. We email you as this date approaches.
        </span>
      </label>

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add unit"}
        </button>
      </div>
    </form>
  );
}
