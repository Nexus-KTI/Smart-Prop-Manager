"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { createProperty, createUnit } from "@/lib/api";

const STEPS = ["Welcome", "Property", "Unit"] as const;

type StepIndex = 0 | 1 | 2;

type OnboardingWizardProps = {
  userName?: string;
};

export function OnboardingWizard({ userName = "" }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(0);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unitFrequency, setUnitFrequency] = useState("monthly");

  function goBack() {
    setError(null);
    if (step === 0) return;
    setStep((step - 1) as StepIndex);
  }

  function finish(opts?: { unitId?: string | null; propertyId?: string | null }) {
    const unitId = opts?.unitId ?? null;
    const propertyId = opts?.propertyId ?? null;
    let path = "/properties";
    if (unitId) {
      path = `/properties?highlight=${encodeURIComponent(unitId)}`;
    } else if (propertyId) {
      // Zero-unit property must land on the hub row (needsUnit), not disappear.
      path = `/properties?highlightProperty=${encodeURIComponent(propertyId)}`;
    }
    router.replace(path);
    router.refresh();
  }

  async function onPropertySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const address = String(form.get("address") ?? "").trim();
    const typeRaw = String(form.get("type") ?? "rental").trim();
    const type =
      typeRaw === "estate" || typeRaw === "rental" ? typeRaw : "rental";
    const latRaw = String(form.get("latitude") ?? "").trim();
    const lngRaw = String(form.get("longitude") ?? "").trim();
    const latitude = latRaw && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null;
    const longitude =
      lngRaw && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null;

    try {
      if (!name) throw new Error("Property name is required.");
      const property = await createProperty({
        name,
        address: address || null,
        type,
        ...(latitude != null && longitude != null
          ? { latitude, longitude }
          : {}),
      });
      setPropertyId(property.id);
      setPropertyName(property.name);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create property.");
    } finally {
      setPending(false);
    }
  }

  async function onUnitSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) {
      setError("Add a property first.");
      return;
    }

    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "").trim();
    const rentAmount = Number(String(form.get("rent_amount") ?? "").trim());
    const frequency = String(form.get("frequency") ?? "monthly").trim() as
      | "daily"
      | "weekly"
      | "monthly"
      | "annual";
    const tenantName = String(form.get("tenant_name") ?? "").trim();
    const tenantContact = String(form.get("tenant_contact") ?? "").trim();
    const dueDayRaw = String(form.get("due_day") ?? "").trim();
    const dueDay = dueDayRaw ? Number(dueDayRaw) : null;
    const serviceRaw = String(form.get("service_charge_amount") ?? "").trim();
    const serviceCharge = serviceRaw ? Number(serviceRaw) : null;
    const termEnd = String(form.get("term_end") ?? "").trim() || null;
    const dueMonthRaw = String(form.get("due_month") ?? "").trim();

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
      if (!["daily", "weekly", "monthly", "annual"].includes(frequency)) {
        throw new Error("Choose a valid rent frequency.");
      }
      if (
        dueDay != null &&
        (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)
      ) {
        throw new Error("Due day must be between 1 and 31.");
      }
      let dueMonth: number | null = null;
      if (frequency === "annual") {
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

      const unit = await createUnit(propertyId, {
        label,
        rent_amount: rentAmount,
        frequency,
        tenant_name: tenantName || null,
        tenant_contact: tenantContact || null,
        due_day: dueDay,
        due_month: dueMonth,
        service_charge_amount: serviceCharge,
        term_end: termEnd,
      });
      finish({ unitId: unit.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add unit.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="onboarding">
      <div className="onboarding-steps" aria-label="Onboarding progress">
        {STEPS.map((label, index) => {
          const state =
            index < step ? "complete" : index === step ? "active" : "upcoming";
          return (
            <div key={label} className="onboarding-step" data-state={state}>
              <span className="onboarding-step-dot" aria-hidden>
                {state === "complete" ? "✓" : index + 1}
              </span>
              <span className="onboarding-step-label">{label}</span>
            </div>
          );
        })}
      </div>

      <div className="onboarding-card">
        {step === 0 ? (
          <div className="onboarding-panel">
            <h1 className="page-title">
              {userName ? `Welcome, ${userName}` : "Welcome"}
            </h1>
            <p className="page-subtitle">
              Let&apos;s get your first property set up.
            </p>
            <div className="onboarding-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <form className="onboarding-panel" onSubmit={onPropertySubmit}>
            <h1 className="page-title">Add a property</h1>
            <p className="page-subtitle">
              Start with one building or compound. You can add more later.
            </p>

            {error ? <p className="form-error">{error}</p> : null}

            <label className="form-field">
              <span className="form-label">Property name</span>
              <input
                className="form-input"
                name="name"
                type="text"
                required
                placeholder="e.g. Palm Court"
                autoComplete="organization"
                defaultValue={propertyName}
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

            <div className="onboarding-actions">
              <button className="btn-primary" type="submit" disabled={pending}>
                {pending ? "Saving…" : "Continue"}
              </button>
              <button
                type="button"
                className="onboarding-back"
                onClick={goBack}
                disabled={pending}
              >
                Back
              </button>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <form className="onboarding-panel" onSubmit={onUnitSubmit}>
            <h1 className="page-title">Add a unit</h1>
            <p className="page-subtitle">
              {propertyName
                ? `Add the first flat or shop under ${propertyName}.`
                : "Add the first flat or shop under this property."}
            </p>

            {error ? <p className="form-error">{error}</p> : null}

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
                  value={unitFrequency}
                  required
                  onChange={(event) => setUnitFrequency(event.target.value)}
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
              <span className="form-hint">
                Must match Settings → Notifications (phone for SMS/WhatsApp,
                email for Email).
              </span>
            </label>

            {unitFrequency === "annual" ? (
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
                required={unitFrequency === "annual"}
              />
              {unitFrequency === "annual" ? (
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
              <input
                className="form-input mono-data"
                name="term_end"
                type="date"
              />
              <span className="form-hint">
                Optional. We email you as this date approaches.
              </span>
            </label>

            <div className="onboarding-actions">
              <button className="btn-primary" type="submit" disabled={pending}>
                {pending ? "Saving…" : "Continue"}
              </button>
              <button
                type="button"
                className="onboarding-back"
                onClick={goBack}
                disabled={pending}
              >
                Back
              </button>
            </div>

            <button
              type="button"
              className="onboarding-skip"
              onClick={() => {
                if (!propertyId) {
                  setError("Add a property first, then you can skip the unit.");
                  return;
                }
                finish({ propertyId });
              }}
              disabled={pending || !propertyId}
            >
              Skip for now
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
