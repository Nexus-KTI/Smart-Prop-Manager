/** User-facing auth errors — avoid account enumeration / method steering. */

export function formatEmailLoginError(message: string | undefined): string {
  const raw = message || "Could not sign in.";
  const lower = raw.toLowerCase();

  if (raw === "Failed to fetch" || lower.includes("networkerror")) {
    return "Can't reach the sign-in service. Check your internet and try again.";
  }

  if (
    raw === "Invalid login credentials" ||
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials") ||
    lower.includes("user not found")
  ) {
    return "Sign-in failed. Check your details and try again.";
  }

  if (lower.includes("captcha")) {
    return "Complete the captcha and try again.";
  }

  if (lower.includes("email not confirmed")) {
    return "Confirm your email first (check your inbox), then try again.";
  }

  if (lower.includes("too many") || lower.includes("rate limit")) {
    return "Too many attempts. Wait a moment and try again.";
  }

  return "Sign-in failed. Try again, or use a different method.";
}
