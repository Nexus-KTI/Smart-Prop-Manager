"use client";

import { COUNTRY_CODES } from "@/lib/phone";

type PhoneInputProps = {
  countryCode: string;
  localPhone: string;
  onCountryCodeChange: (value: string) => void;
  onLocalPhoneChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
};

export function PhoneInput({
  countryCode,
  localPhone,
  onCountryCodeChange,
  onLocalPhoneChange,
  disabled = false,
  required = true,
  id = "phone",
}: PhoneInputProps) {
  return (
    <div className="auth-phone-row">
      <select
        className="form-input auth-country-select"
        name="country_code"
        value={countryCode}
        onChange={(event) => onCountryCodeChange(event.target.value)}
        aria-label="Country code"
        disabled={disabled}
      >
        {COUNTRY_CODES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
      <input
        className="form-input mono-data"
        id={id}
        name="phone"
        type="tel"
        required={required}
        autoComplete="tel-national"
        placeholder="801 234 5678"
        value={localPhone}
        disabled={disabled}
        onChange={(event) => onLocalPhoneChange(event.target.value)}
      />
    </div>
  );
}
