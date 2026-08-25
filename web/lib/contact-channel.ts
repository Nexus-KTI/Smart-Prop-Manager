export type NotifyChannel = "sms" | "whatsapp" | "email";

export function looksLikeEmail(contact: string): boolean {
  const value = (contact || "").trim();
  if (!value.includes("@")) return false;
  const domain = value.split("@").pop() || "";
  return domain.includes(".");
}

/** Short hint under tenant contact fields, match Settings channel. */
export function tenantContactHint(channel: NotifyChannel | string | null | undefined): string {
  const resolved =
    channel === "email" || channel === "whatsapp" || channel === "sms"
      ? channel
      : "sms";
  if (resolved === "email") {
    return "Settings use Email. Enter the tenant’s email address here.";
  }
  if (resolved === "whatsapp") {
    return "Settings use WhatsApp. Enter a phone number (not an email).";
  }
  return "Settings use SMS. Enter a phone number (not an email).";
}

export function contactMatchesChannel(
  channel: NotifyChannel | string | null | undefined,
  contact: string,
): boolean {
  const value = (contact || "").trim();
  if (!value) return false;
  const resolved =
    channel === "email" || channel === "whatsapp" || channel === "sms"
      ? channel
      : "sms";
  if (resolved === "email") return looksLikeEmail(value);
  return !looksLikeEmail(value);
}
