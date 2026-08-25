/** Product brand lock, keep UI/marketing strings on this source of truth. */
export const BRAND_NAME = "Nexora";
export const BRAND_COMPANY = "KTI";
export const BRAND_STAMP = "by KTI";
export const BRAND_FULL = "Nexora by KTI";
export const BRAND_TAGLINE = "Who paid. Who owes. What’s next.";
export const BRAND_ONE_LINER =
  "Nexora is the landlord’s daily list for rent and chase, built to grow into full estate ops, without sounding like an ecosystem pitch to users.";

/** E.164 preferred. Empty = hide support FAB / welcome support CTA. */
export const SUPPORT_WHATSAPP = (
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || ""
).trim();

export function supportWhatsAppUrl(message?: string): string | null {
  const digits = SUPPORT_WHATSAPP.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const phone = digits.startsWith("+") ? digits.slice(1) : digits;
  if (!phone) return null;
  const text = encodeURIComponent(
    message || `Hi ${BRAND_NAME} support. I need help with my tenant account.`,
  );
  return `https://wa.me/${phone}?text=${text}`;
}