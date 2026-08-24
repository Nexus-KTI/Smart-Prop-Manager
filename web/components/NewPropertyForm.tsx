"use client";

import { useActionState } from "react";

import {
  createPropertyAction,
  type FormState,
} from "@/app/(dashboard)/properties/actions";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

const initialState: FormState = {};

export function NewPropertyForm() {
  const [state, formAction, pending] = useActionState(
    createPropertyAction,
    initialState,
  );

  return (
    <form className="form-card" action={formAction}>
      {state.error ? <p className="form-error">{state.error}</p> : null}

      <label className="form-field">
        <span className="form-label">Property name</span>
        <input
          className="form-input"
          name="name"
          type="text"
          required
          placeholder="e.g. Palm Court"
          autoComplete="organization"
        />
      </label>

      <label className="form-field">
        <span className="form-label">Address</span>
        <AddressAutocomplete placeholder="Street, city" />
      </label>

      <label className="form-field">
        <span className="form-label">Type</span>
        <select
          className="form-input"
          name="type"
          defaultValue="rental"
          required
        >
          <option value="rental">Rental</option>
          <option value="estate">Estate</option>
        </select>
      </label>

      <div className="form-actions">
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create property"}
        </button>
      </div>
    </form>
  );
}
