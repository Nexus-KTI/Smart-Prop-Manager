/** Shared MFA helpers for email + phone sign-in. */

import { createClient } from "@/lib/supabase/client";

/** Returns verified TOTP factor id when AAL2 is required but not yet satisfied. */
export async function getPendingMfaFactorId(): Promise<string | null> {
  const supabase = createClient();
  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) {
    throw aalError;
  }
  if (!aal) {
    throw new Error("Could not read authenticator assurance level");
  }
  if (aal.currentLevel === "aal2" || aal.nextLevel !== "aal2") {
    return null;
  }
  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  if (factorsError) {
    throw factorsError;
  }
  const totp = factors?.totp?.find((f) => f.status === "verified");
  return totp?.id ?? null;
}

export async function verifyMfaCode(
  factorId: string,
  code: string,
): Promise<void> {
  const supabase = createClient();
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) throw challenge.error;
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.trim(),
  });
  if (verify.error) throw verify.error;
}
