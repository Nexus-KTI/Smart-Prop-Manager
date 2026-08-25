/** Shared email-password rules for signup, reset, and settings. */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordCheck = {
  ok: boolean;
  message: string | null;
};

export function validatePassword(password: string): PasswordCheck {
  if (!password) {
    return { ok: false, message: "Enter a password." };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  return { ok: true, message: null };
}

export function validatePasswordPair(
  password: string,
  confirm: string,
): PasswordCheck {
  const base = validatePassword(password);
  if (!base.ok) return base;
  if (password !== confirm) {
    return { ok: false, message: "Passwords do not match." };
  }
  return { ok: true, message: null };
}

export function passwordHint(): string {
  return `At least ${PASSWORD_MIN_LENGTH} characters`;
}

export function formatPasswordAuthError(message: string | undefined): string {
  const raw = (message || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Could not update password.";

  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already exists")
  ) {
    return "An account with that email already exists. Sign in instead, or reset your password.";
  }
  if (lower.includes("same password") || lower.includes("should be different")) {
    return "Choose a password you haven’t used recently.";
  }
  if (lower.includes("weak") || lower.includes("pwned")) {
    return "That password is too weak or commonly used. Pick a stronger one.";
  }
  if (
    lower.includes("session") ||
    lower.includes("jwt") ||
    lower.includes("not authenticated")
  ) {
    return "This reset link is invalid or has expired. Request a new one from sign in.";
  }
  if (raw === "Failed to fetch" || lower.includes("networkerror")) {
    return "Can't reach Supabase. Check your connection and try again.";
  }

  return raw;
}
