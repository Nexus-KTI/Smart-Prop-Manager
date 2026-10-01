"use client";

import { useEffect, useRef } from "react";

export const OTP_CODE_LENGTH = 6;

type OtpCodeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Fires once per distinct full code (typed, pasted, or SMS autofill). */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  autoFocus?: boolean;
};

export function OtpCodeField({
  value,
  onChange,
  onComplete,
  disabled = false,
  label = "Verification code",
  id = "otp",
  autoFocus = false,
}: OtpCodeFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAttemptedRef = useRef<string | null>(null);
  const wasDisabledRef = useRef(disabled);

  // After a verify attempt re-enables the field (i.e. the code was rejected),
  // select the digits so the next keystrokes replace them.
  useEffect(() => {
    if (wasDisabledRef.current && !disabled && value.length === OTP_CODE_LENGTH) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    wasDisabledRef.current = disabled;
  }, [disabled, value]);

  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input
        ref={inputRef}
        className="form-input mono-data auth-otp-input"
        id={id}
        name="otp"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        required
        autoFocus={autoFocus}
        placeholder="000000"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value
            .replace(/\D/g, "")
            .slice(0, OTP_CODE_LENGTH);
          onChange(next);
          if (
            onComplete &&
            !disabled &&
            next.length === OTP_CODE_LENGTH &&
            next !== lastAttemptedRef.current
          ) {
            lastAttemptedRef.current = next;
            onComplete(next);
          }
        }}
      />
    </label>
  );
}
