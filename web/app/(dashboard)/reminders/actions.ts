"use server";

import { revalidatePath } from "next/cache";

import { sendReminder } from "@/lib/api-server";

export type ReminderFormState = {
  error?: string;
  success?: string;
};

export async function sendReminderAction(
  unitId: string,
  _prev: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const contact = String(formData.get("contact") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!contact) {
    return { error: "Contact is required." };
  }
  if (!message) {
    return { error: "Message is required." };
  }

  try {
    await sendReminder({
      unit_id: unitId,
      contact,
      message,
    });
    revalidatePath(`/reminders/${unitId}`);
    return { success: "Reminder queued." };
  } catch (error) {
    revalidatePath(`/reminders/${unitId}`);
    return {
      error:
        error instanceof Error ? error.message : "Could not send reminder.",
    };
  }
}
