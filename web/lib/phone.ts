export const COUNTRY_CODES = [
  { code: "+234", label: "NG +234" },
  { code: "+233", label: "GH +233" },
  { code: "+225", label: "CI +225" },
  { code: "+254", label: "KE +254" },
  { code: "+27", label: "ZA +27" },
  { code: "+1", label: "US +1" },
  { code: "+44", label: "UK +44" },
] as const;

export function toE164(countryCode: string, localNumber: string): string {
  const cc = countryCode.replace(/\D/g, "");
  let local = localNumber.replace(/\D/g, "");
  // If user pasted full international number, don't double the country code
  if (local.startsWith(cc) && local.length > cc.length + 6) {
    local = local.slice(cc.length);
  }
  local = local.replace(/^0+/, "");
  return `+${cc}${local}`;
}

export function isValidMobileE164(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  // E.164 max 15 digits; NG mobiles are typically 13 with country code (234 + 10)
  return digits.length >= 10 && digits.length <= 15;
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  const value = String(phone).trim();
  if (!value) return "";
  return value.startsWith("+") ? value : `+${value}`;
}

/** Split an E.164 (or loose) phone into country code + local for PhoneInput. */
export function splitE164(
  phone: string | null | undefined,
): { countryCode: string; localPhone: string } | null {
  const cleaned = (phone || "").trim().replace(/^whatsapp:/i, "").trim();
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 10) return null;

  const sorted = [...COUNTRY_CODES].sort(
    (a, b) => b.code.replace(/\D/g, "").length - a.code.replace(/\D/g, "").length,
  );
  for (const item of sorted) {
    const cc = item.code.replace(/\D/g, "");
    if (digits.startsWith(cc) && digits.length > cc.length + 5) {
      return { countryCode: item.code, localPhone: digits.slice(cc.length) };
    }
  }
  return {
    countryCode: "+234",
    localPhone: digits.replace(/^234/, "").replace(/^0+/, ""),
  };
}

