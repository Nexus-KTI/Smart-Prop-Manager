"use client";

import { useState } from "react";

import { PASSWORD_MIN_LENGTH, passwordHint } from "@/lib/password";

type PasswordFieldsProps = {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  disabled?: boolean;
  /** Labels for reset vs create */
  passwordLabel?: string;
  confirmLabel?: string;
  autoComplete?: "new-password" | "current-password";
};

export function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  disabled,
  passwordLabel = "Password",
  confirmLabel = "Confirm password",
  autoComplete = "new-password",
}: PasswordFieldsProps) {
  const [show, setShow] = useState(false);

  return (
    <>
      <label className="form-field">
        <div className="form-label-row">
          <span className="form-label">{passwordLabel}</span>
          <button
            type="button"
            className="auth-alt-link"
            onClick={() => setShow((v) => !v)}
            tabIndex={-1}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <input
          className="form-input"
          name="password"
          type={show ? "text" : "password"}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete={autoComplete}
          value={password}
          disabled={disabled}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={passwordHint()}
        />
        <span className="form-help">{passwordHint()}</span>
      </label>

      <label className="form-field">
        <span className="form-label">{confirmLabel}</span>
        <input
          className="form-input"
          name="confirm_password"
          type={show ? "text" : "password"}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete={autoComplete}
          value={confirm}
          disabled={disabled}
          onChange={(e) => onConfirmChange(e.target.value)}
          placeholder="Repeat password"
        />
      </label>
    </>
  );
}
