/** Public signup gate, must match SignupForm / F12. */
export function inviteOnlySignup(): boolean {
  const value = process.env.NEXT_PUBLIC_INVITE_ONLY_SIGNUP;
  return value === "true" || value === "1";
}
