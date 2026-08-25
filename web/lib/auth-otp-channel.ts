/**
 * Phone OTP delivery channel for login/signup.
 * Driven by NEXT_PUBLIC_AUTH_OTP_CHANNEL (sms | whatsapp). Default: sms.
 */
export type AuthOtpChannel = "sms" | "whatsapp";

export function getAuthOtpChannel(): AuthOtpChannel {
  return process.env.NEXT_PUBLIC_AUTH_OTP_CHANNEL === "whatsapp"
    ? "whatsapp"
    : "sms";
}

/** Human label for UI copy, only place auth screens should get channel names. */
export function authOtpChannelLabel(
  channel: AuthOtpChannel = getAuthOtpChannel(),
): string {
  return channel === "whatsapp" ? "WhatsApp" : "SMS";
}

/** Muted `.form-help` line under the phone field. */
export function authOtpChannelSendHelp(
  channel: AuthOtpChannel = getAuthOtpChannel(),
): string {
  const label = authOtpChannelLabel(channel);
  return channel === "whatsapp"
    ? `We’ll send a 6-digit code on ${label}.`
    : `We’ll send a 6-digit code by ${label}.`;
}

/** Muted success/info line after a code is sent. */
export function authOtpChannelCodeSentHelp(
  phone: string,
  channel: AuthOtpChannel = getAuthOtpChannel(),
): string {
  return `Enter the 6-digit code sent to ${phone} via ${authOtpChannelLabel(channel)}.`;
}

/** Validation / OTP-step helper when the code field is incomplete. */
export function authOtpChannelEnterCodeHelp(
  channel: AuthOtpChannel = getAuthOtpChannel(),
): string {
  return `Enter the 6-digit code from your ${authOtpChannelLabel(channel)}.`;
}

/**
 * Rewrite provider-config errors so UI names match AUTH_OTP_CHANNEL.
 * Returns null when the message is not a phone-provider configuration error.
 */
export function authOtpChannelProviderError(
  message: string,
  channel: AuthOtpChannel = getAuthOtpChannel(),
): string | null {
  const lower = message.toLowerCase();
  const mentionsProvider =
    lower.includes("provider") ||
    lower.includes("not configured") ||
    lower.includes("twilio");
  const mentionsPhoneChannel =
    lower.includes("sms") ||
    lower.includes("whatsapp") ||
    lower.includes("phone");
  if (!mentionsProvider || !mentionsPhoneChannel) return null;
  return `Phone login is not fully configured. Ask the admin to enable Twilio Phone Auth (${authOtpChannelLabel(channel)}) in Supabase.`;
}
