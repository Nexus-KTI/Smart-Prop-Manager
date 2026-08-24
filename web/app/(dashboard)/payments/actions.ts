"use server";

import { revalidatePath } from "next/cache";

import { confirmPaystackPayment, recordManualPayment } from "@/lib/api-server";

export type PaymentFormState = {
  error?: string;
  success?: string;
};

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function recordManualPaymentAction(
  unitId: string,
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const amount = Number(amountRaw);

  if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid payment amount." };
  }

  try {
    await recordManualPayment({ unit_id: unitId, amount });
    revalidatePath(`/payments/${unitId}`);
    revalidatePath("/properties");
    return { success: "Manual payment recorded." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not record manual payment.",
    };
  }
}

export async function confirmPaystackPaymentAction(
  unitId: string,
  reference: string,
): Promise<PaymentFormState> {
  const ref = reference.trim();
  if (!ref) {
    return { error: "Missing Paystack reference." };
  }

  try {
    await confirmPaystackPayment({ unit_id: unitId, reference: ref });
    revalidatePath(`/payments/${unitId}`);
    revalidatePath("/properties");
    return { success: "Paystack payment confirmed." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not confirm Paystack payment.",
    };
  }
}
