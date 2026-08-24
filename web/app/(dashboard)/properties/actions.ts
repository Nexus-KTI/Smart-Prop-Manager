"use server";

import { redirect } from "next/navigation";

import { createProperty, createUnit } from "@/lib/api-server";

export type FormState = {
  error?: string;
};

function parseOptionalCoord(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createPropertyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "rental").trim();
  const type =
    typeRaw === "estate" || typeRaw === "rental" ? typeRaw : "rental";
  const latitude = parseOptionalCoord(formData.get("latitude"));
  const longitude = parseOptionalCoord(formData.get("longitude"));
  const hasCoords = latitude != null && longitude != null;

  if (!name) {
    return { error: "Property name is required." };
  }

  try {
    const property = await createProperty({
      name,
      address: address || null,
      type,
      ...(hasCoords
        ? { latitude, longitude }
        : {}),
    });
    redirect(`/properties/${property.id}/units/new`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not create property. Try again.",
    };
  }
}

export async function createUnitAction(
  propertyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const label = String(formData.get("label") ?? "").trim();
  const rentRaw = String(formData.get("rent_amount") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "monthly").trim();
  const tenantName = String(formData.get("tenant_name") ?? "").trim();
  const tenantContact = String(formData.get("tenant_contact") ?? "").trim();
  const dueDayRaw = String(formData.get("due_day") ?? "").trim();
  const dueMonthRaw = String(formData.get("due_month") ?? "").trim();
  const serviceRaw = String(formData.get("service_charge_amount") ?? "").trim();
  const termEnd = String(formData.get("term_end") ?? "").trim() || null;

  if (!label) {
    return { error: "Unit label is required." };
  }

  const rentAmount = Number(rentRaw);
  if (!rentRaw || !Number.isFinite(rentAmount) || rentAmount < 0) {
    return { error: "Enter a valid rent amount." };
  }

  let serviceCharge: number | null = null;
  if (serviceRaw) {
    serviceCharge = Number(serviceRaw);
    if (!Number.isFinite(serviceCharge) || serviceCharge < 0) {
      return { error: "Enter a valid service charge amount." };
    }
  }

  if (!["daily", "weekly", "monthly", "annual"].includes(frequency)) {
    return { error: "Select a valid frequency." };
  }

  let dueDay: number | null = null;
  if (dueDayRaw) {
    dueDay = Number(dueDayRaw);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      return { error: "Due day must be a whole number between 1 and 31." };
    }
  }

  let dueMonth: number | null = null;
  if (frequency === "annual") {
    dueMonth = dueMonthRaw ? Number(dueMonthRaw) : 1;
    if (!Number.isInteger(dueMonth) || dueMonth < 1 || dueMonth > 12) {
      return { error: "Due month must be between 1 and 12." };
    }
    if (dueDay == null) {
      return { error: "Due day is required for annual rent." };
    }
  }

  if (termEnd && !/^\d{4}-\d{2}-\d{2}$/.test(termEnd)) {
    return { error: "Term end must be a valid date." };
  }

  try {
    const unit = await createUnit(propertyId, {
      label,
      rent_amount: rentAmount,
      frequency: frequency as "daily" | "weekly" | "monthly" | "annual",
      tenant_name: tenantName || null,
      tenant_contact: tenantContact || null,
      due_day: dueDay,
      due_month: dueMonth,
      service_charge_amount: serviceCharge,
      term_end: termEnd,
    });
    redirect(`/properties?highlight=${encodeURIComponent(unit.id)}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not create unit. Try again.",
    };
  }
}
