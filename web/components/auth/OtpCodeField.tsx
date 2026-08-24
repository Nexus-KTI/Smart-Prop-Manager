"use client";

type OtpCodeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
};

export function OtpCodeField({
  value,
  onChange,
  disabled = false,
  label = "Verification code",
  id = "otp",
}: OtpCodeFieldProps) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input
        className="form-input mono-data auth-otp-input"
        id={id}
        name="otp"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        placeholder="000000"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, 6))
        }
      />
    </label>
  );
}
