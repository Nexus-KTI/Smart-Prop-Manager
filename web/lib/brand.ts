/** Product brand lock, keep UI/marketing strings on this source of truth. */
export const BRAND_NAME = "Nexora";
export const BRAND_COMPANY = "KTI";
export const BRAND_STAMP = "by KTI";
export const BRAND_FULL = "Nexora by KTI";
export const BRAND_TAGLINE = "Who paid. Who owes. What’s next.";
export const BRAND_ONE_LINER =
  "Nexora is an Estate OS for Nigerian landlords: unit money truth first, then tenancies, messages, repairs, access, staff, and books - without US proptech pitch speak in the logged-in product.";

/**
 * Brand mark paths under /public/brand (Option B preview).
 * Swap files in place when designer finals land — keep these paths stable.
 */
export const BRAND_ASSETS = {
  mark: "/brand/mark.svg",
  markForest: "/brand/mark-forest.svg",
  markInk: "/brand/mark-ink.svg",
  appIcon: "/brand/app-icon.svg",
  avatarCircle: "/brand/avatar-circle.svg",
  markOptionA: "/brand/mark-option-a.svg",
} as const;
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

export type BrandSocialId =
  | "linkedin"
  | "x"
  | "instagram"
  | "youtube"
  | "whatsapp";

export type BrandSocialLink = {
  id: BrandSocialId;
  label: string;
  href: string;
};

function envUrl(value: string | undefined): string {
  return (value || "").trim();
}

/** Public marketing socials — set NEXT_PUBLIC_SOCIAL_* (empty = hide that icon). */
export function brandSocialLinks(): BrandSocialLink[] {
  const whatsapp =
    envUrl(process.env.NEXT_PUBLIC_SOCIAL_WHATSAPP) ||
    (SUPPORT_WHATSAPP
      ? `https://wa.me/${SUPPORT_WHATSAPP.replace(/[^\d]/g, "")}`
      : "");

  const links: BrandSocialLink[] = [
    {
      id: "linkedin",
      label: "LinkedIn",
      href: envUrl(process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN),
    },
    {
      id: "x",
      label: "X",
      href: envUrl(process.env.NEXT_PUBLIC_SOCIAL_X),
    },
    {
      id: "instagram",
      label: "Instagram",
      href: envUrl(process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM),
    },
    {
      id: "youtube",
      label: "YouTube",
      href: envUrl(process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE),
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: whatsapp,
    },
  ];

  return links.filter((link) => Boolean(link.href));
}