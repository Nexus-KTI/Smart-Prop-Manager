export function formatEmailLoginError(message: string | undefined): string {
  const raw = message || "Could not sign in.";

  if (raw === "Failed to fetch" || raw.toLowerCase().includes("networkerror")) {
    return "Can't reach Supabase. Check your internet and web/.env.local, then restart npm run dev.";
  }

  if (
    raw === "Invalid login credentials" ||
    raw.toLowerCase().includes("invalid login credentials")
  ) {
    return "No email/password account matches those details. If you signed up with your phone number, switch to the Phone tab. To add email sign-in later, sign in with phone and go to Settings → Security.";
  }

  if (raw.toLowerCase().includes("email not confirmed")) {
    return "Confirm your email first (check your inbox), then try again.";
  }

  return raw;
}
