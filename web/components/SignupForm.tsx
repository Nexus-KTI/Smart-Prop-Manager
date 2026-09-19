"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { AuthLoadingGate } from "@/components/auth/AuthLoadingGate";
import {
  AuthCaptcha,
  requireCaptchaToken,
} from "@/components/auth/AuthCaptcha";
import { PasswordFields } from "@/components/auth/PasswordFields";
import { PhoneOtpFlow } from "@/components/auth/PhoneOtpFlow";
import { claimTenancyInvite, updateMe } from "@/lib/api";
import { BrandMark } from "@/components/BrandMark";
import { authOtpChannelLabel } from "@/lib/auth-otp-channel";
import { BRAND_NAME, BRAND_STAMP } from "@/lib/brand";
import {
  formatPasswordAuthError,
  validatePasswordPair,
} from "@/lib/password";
import { validateSignupInvite } from "@/lib/public-leads";
import { createClient } from "@/lib/supabase/client";
import { normalizeTenancyClaimToken } from "@/lib/tenancy-invite";

type Mode = "phone" | "email";
type SignupRole = "landlord" | "tenant" | "artisan";
type SignupStep = "role" | "qualify" | "account";
type SignupPersona =
  | "manage_own"
  | "manage_others"
  | "manage_mix"
  | "none_yet"
  | "broker";
type SignupYears = "less_1" | "1_4" | "5_10" | "more_10" | "none_yet";

const INVITE_ONLY =
  process.env.NEXT_PUBLIC_INVITE_ONLY_SIGNUP === "true" ||
  process.env.NEXT_PUBLIC_INVITE_ONLY_SIGNUP === "1";

const PERSONA_OPTIONS: { value: SignupPersona; label: string }[] = [
  { value: "manage_own", label: "I manage my own rental(s)" },
  { value: "manage_others", label: "I manage rentals for others" },
  { value: "manage_mix", label: "I manage a mix of both" },
  { value: "none_yet", label: "I don’t manage any rentals yet" },
  { value: "broker", label: "I’m an apartment or rental broker" },
];

const YEARS_OPTIONS: { value: SignupYears; label: string }[] = [
  { value: "less_1", label: "Less than a year" },
  { value: "1_4", label: "1–4 years" },
  { value: "5_10", label: "5–10 years" },
  { value: "more_10", label: "More than 10 years" },
  { value: "none_yet", label: "I don’t manage any rentals yet" },
];

const STEPS: SignupStep[] = ["role", "qualify", "account"];

function stepIndex(step: SignupStep): number {
  return STEPS.indexOf(step);
}

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const otpChannel = authOtpChannelLabel();
  const defaultEmail = searchParams.get("email") ?? "";
  const inviteName = searchParams.get("name") ?? "";
  const inviteWhatsapp = searchParams.get("whatsapp") ?? "";
  const inviteToken = (searchParams.get("invite") ?? "").trim();
  const tokenParam = (searchParams.get("token") ?? "").trim();
  // Landlord beta: ?invite=<lead id>. Tenant/artisan claim: ?token=.
  const hasAccessCode = Boolean(inviteToken) || Boolean(tokenParam);
  const roleParam = searchParams.get("role");

  const initialRole: SignupRole =
    roleParam === "tenant"
      ? "tenant"
      : roleParam === "artisan"
        ? "artisan"
        : "landlord";

  const [step, setStep] = useState<SignupStep>("role");
  const [role, setRole] = useState<SignupRole>(initialRole);
  const [persona, setPersona] = useState<SignupPersona | null>(null);
  const [unitCount, setUnitCount] = useState(0);
  const [years, setYears] = useState<SignupYears | null>(null);
  // Tenancy/artisan claim tokens use ?token=. Lead ?invite= is landlord beta only.
  const [claimCode, setClaimCode] = useState(
    normalizeTenancyClaimToken(tokenParam),
  );
  const [artisanTrades, setArtisanTrades] = useState("");
  const [mode, setMode] = useState<Mode>("phone");
  const [fullName, setFullName] = useState(inviteName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [booting, setBooting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [qualifyError, setQualifyError] = useState<string | null>(null);
  const [inviteStatus, setInviteStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");

  useEffect(() => {
    if (!INVITE_ONLY || !inviteToken) {
      setInviteStatus("idle");
      return;
    }
    let cancelled = false;
    setInviteStatus("checking");
    validateSignupInvite(inviteToken).then((result) => {
      if (cancelled) return;
      setInviteStatus(result.valid ? "valid" : "invalid");
      if (result.valid && result.name && !inviteName) {
        setFullName(result.name);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [inviteToken, inviteName]);

  const signupMeta = useMemo(() => {
    const meta: Record<string, string | number | boolean> = { role };
    if (role === "landlord") {
      if (persona) meta.signup_persona = persona;
      meta.signup_unit_count = unitCount;
      if (years) meta.signup_years = years;
    }
    if (fullName.trim()) meta.full_name = fullName.trim();
    if (acceptedTerms) meta.accepted_terms = true;
    if (role === "artisan" && artisanTrades.trim()) {
      meta.artisan_trades = artisanTrades.trim();
    }
    return meta;
  }, [role, persona, unitCount, years, fullName, acceptedTerms, artisanTrades]);

  async function assertInviteOk(): Promise<boolean> {
    if (!INVITE_ONLY) return true;
    if (tokenParam && !inviteToken) return true;
    if (!inviteToken) {
      setError("This signup link is missing an invite code.");
      return false;
    }
    const result = await validateSignupInvite(inviteToken);
    if (!result.valid) {
      setInviteStatus("invalid");
      setError(
        `This invite link is invalid or expired. Request access again, or use the link from your ${otpChannel}.`,
      );
      return false;
    }
    setInviteStatus("valid");
    return true;
  }

  if (booting) {
    return <AuthLoadingGate label="Setting up your account…" />;
  }

  if (INVITE_ONLY && !hasAccessCode) {
    return (
      <div className="signup-shell signup-shell--gated">
        <div className="form-card auth-card signup-form-col">
          <p className="form-error">
            {BRAND_NAME} is invite-only right now. Request access on the home
            page, we’ll text you a signup link when you’re approved.
          </p>
          <p className="form-hint">
            Already received an invite? Open the link from your {otpChannel} (it
            includes a one-time invite code). Don’t use this page URL alone.
          </p>
          <div className="form-actions auth-actions">
            <Link href="/#get-started" className="btn-primary">
              Request access
            </Link>
          </div>
          <p className="auth-switch">
            Already have an account?{" "}
            <Link href="/login" className="auth-alt-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (INVITE_ONLY && inviteToken && inviteStatus === "checking") {
    return <AuthLoadingGate label="Checking invite…" />;
  }

  if (INVITE_ONLY && inviteToken && inviteStatus === "invalid") {
    return (
      <div className="signup-shell signup-shell--gated">
        <div className="form-card auth-card signup-form-col">
          <p className="form-error">
            This invite link is invalid or expired. Request access again, or
            open the latest link from your {otpChannel}.
          </p>
          <div className="form-actions auth-actions">
            <Link href="/#get-started" className="btn-primary">
              Request access
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function landlordQualifyOk(): boolean {
    if (role !== "landlord") return true;
    if (!persona || !years) {
      setQualifyError("Answer the landlord questions before continuing.");
      return false;
    }
    setQualifyError(null);
    return true;
  }

  function accountOk(): boolean {
    if (!acceptedTerms) {
      setError("Accept the terms to create your account.");
      return false;
    }
    if (mode === "email" && !fullName.trim()) {
      setError("Enter your name.");
      return false;
    }
    setError(null);
    return true;
  }

  async function persistSignupProfile() {
    try {
      await updateMe({
        role,
        name: fullName.trim() || undefined,
        signup_persona: role === "landlord" ? persona : null,
        signup_unit_count: role === "landlord" ? unitCount : null,
        signup_years: role === "landlord" ? years : null,
      });
    } catch {
      /* trigger/metadata may already have set role; continue */
    }
  }

  async function finishSignup() {
    setBooting(true);
    await persistSignupProfile();
    const code = normalizeTenancyClaimToken(claimCode);

    if (role === "tenant") {
      if (code) {
        try {
          await claimTenancyInvite(code);
          router.replace("/tenant");
          router.refresh();
          return;
        } catch {
          setBooting(false);
          setError(
            "Could not claim that invite yet. Check the link, or open Claim invite after sign-in.",
          );
          router.replace(`/tenant/claim?token=${encodeURIComponent(code)}`);
          router.refresh();
          return;
        }
      }
      router.replace("/tenant");
      router.refresh();
      return;
    }

    if (role === "artisan") {
      if (code) {
        router.replace(`/artisan/claim?token=${encodeURIComponent(code)}`);
      } else {
        router.replace("/artisan");
      }
      router.refresh();
      return;
    }

    router.replace("/onboarding");
    router.refresh();
  }

  async function onPhoneSuccess() {
    if (!landlordQualifyOk() || !accountOk()) return;
    if (!(await assertInviteOk())) return;
    await finishSignup();
  }

  function selectMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
    setConfirmPassword("");
  }

  function goNextFromRole() {
    setQualifyError(null);
    setStep("qualify");
  }

  function goNextFromQualify() {
    if (role === "landlord" && !landlordQualifyOk()) return;
    setStep("account");
  }

  async function onEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!landlordQualifyOk() || !accountOk()) return;
    setError(null);
    setInfo(null);
    setPending(true);

    if (!(await assertInviteOk())) {
      setPending(false);
      return;
    }

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();

    const check = validatePasswordPair(password, confirmPassword);
    if (!check.ok) {
      setPending(false);
      setError(check.message);
      return;
    }

    const supabase = createClient();
    let captcha: string | null = null;
    try {
      captcha = requireCaptchaToken(captchaToken);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Complete the captcha.");
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...signupMeta,
          full_name: fullName.trim(),
          name: fullName.trim(),
        },
        ...(captcha ? { captchaToken: captcha } : {}),
      },
    });
    setCaptchaToken(null);

    setPending(false);

    if (signUpError) {
      setError(formatPasswordAuthError(signUpError.message));
      return;
    }

    if (data.session) {
      await finishSignup();
      return;
    }

    setInfo("Account created. Check your email to confirm, then sign in.");
  }

  const previewKicker =
    role === "tenant"
      ? "Tenant portal"
      : role === "artisan"
        ? "Artisan portal"
        : "Landlord portal";

  const previewTitle =
    role === "tenant"
      ? "See what’s due and pay without chasing rent on chat."
      : role === "artisan"
        ? "See assigned jobs and update work as you go."
        : unitCount > 0
          ? `Built for portfolios like yours, starting around ${unitCount} unit${unitCount === 1 ? "" : "s"}.`
          : "Manage your rental portfolio with ease.";

  return (
    <div className="signup-shell">
      <header className="signup-topbar">
        <Link href="/" className="signup-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            <BrandMark size={22} />
          </span>
          <span className="auth-brand-text">
            {BRAND_NAME}{" "}
            <span className="marketing-logo-stamp">{BRAND_STAMP}</span>
          </span>
        </Link>
        <p className="signup-topbar-auth">
          Already have an account?{" "}
          <Link href="/login" className="auth-alt-link">
            Sign in
          </Link>
        </p>
      </header>

      <div className="signup-grid">
        <div className="signup-form-col">
          <header className="auth-header signup-form-header">
            <h1 className="page-title">Create account</h1>
            <p className="page-subtitle">
              {step === "role"
                ? "Who are you signing up as?"
                : step === "qualify"
                  ? "A few details so we route you correctly."
                  : "Verify with phone or email to finish."}
            </p>
          </header>

          <ol className="signup-steps" aria-label="Signup progress">
            {STEPS.map((id, index) => {
              const active = step === id;
              const done = stepIndex(step) > index;
              const label =
                id === "role" ? "Role" : id === "qualify" ? "Details" : "Account";
              return (
                <li
                  key={id}
                  className="signup-step"
                  data-active={active ? "true" : undefined}
                  data-done={done ? "true" : undefined}
                >
                  <span className="signup-step-index" aria-hidden>
                    {done ? "✓" : index + 1}
                  </span>
                  <span className="signup-step-label">{label}</span>
                </li>
              );
            })}
          </ol>

          {hasInvite ? (
            <p className="form-success" role="status">
              {inviteName.trim()
                ? `Welcome, ${inviteName.trim()}. Finish creating your account.`
                : "You’re invited. Finish creating your account."}
            </p>
          ) : null}

          {step === "role" ? (
            <>
              <div
                className="signup-role-grid signup-role-grid--3"
                role="radiogroup"
                aria-label="I am a"
              >
                <button
                  type="button"
                  className={
                    role === "landlord"
                      ? "signup-role-card is-selected"
                      : "signup-role-card"
                  }
                  aria-checked={role === "landlord"}
                  role="radio"
                  onClick={() => {
                    setRole("landlord");
                    setQualifyError(null);
                  }}
                >
                  <span className="signup-role-title">I’m a Landlord</span>
                  <span className="signup-role-badge">Free account</span>
                  <span className="signup-role-copy">
                    Track units, rent, and chase from one list.
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    role === "tenant"
                      ? "signup-role-card is-selected"
                      : "signup-role-card"
                  }
                  aria-checked={role === "tenant"}
                  role="radio"
                  onClick={() => {
                    setRole("tenant");
                    setQualifyError(null);
                  }}
                >
                  <span className="signup-role-title">I’m a Tenant</span>
                  <span className="signup-role-badge">Free account</span>
                  <span className="signup-role-copy">
                    Pay rent, get receipts, and claim your unit invite.
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    role === "artisan"
                      ? "signup-role-card is-selected"
                      : "signup-role-card"
                  }
                  aria-checked={role === "artisan"}
                  role="radio"
                  onClick={() => {
                    setRole("artisan");
                    setQualifyError(null);
                  }}
                >
                  <span className="signup-role-title">I’m an Artisan</span>
                  <span className="signup-role-badge">By invite</span>
                  <span className="signup-role-copy">
                    Join a landlord’s roster and see assigned jobs.
                  </span>
                </button>
              </div>
              <p className="form-hint signup-staff-note">
                Staff and caretakers don’t sign up here, your landlord invites
                you from Team settings, then you claim that link.
              </p>
              <div className="form-actions auth-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={goNextFromRole}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === "qualify" ? (
            <>
              {role === "landlord" ? (
                <div className="signup-qualify">
                  <fieldset className="signup-fieldset">
                    <legend className="form-label">
                      Which best describes you?
                    </legend>
                    {PERSONA_OPTIONS.map((opt) => (
                      <label key={opt.value} className="signup-radio-row">
                        <input
                          type="radio"
                          name="signup_persona"
                          value={opt.value}
                          checked={persona === opt.value}
                          onChange={() => setPersona(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="signup-fieldset">
                    <p className="form-label">
                      How many units do you own/manage?
                    </p>
                    <div className="signup-stepper">
                      <button
                        type="button"
                        className="signup-stepper-btn"
                        aria-label="Decrease units"
                        onClick={() =>
                          setUnitCount((n) => Math.max(0, n - 1))
                        }
                      >
                        −
                      </button>
                      <span className="signup-stepper-value mono-data">
                        {unitCount}
                      </span>
                      <button
                        type="button"
                        className="signup-stepper-btn"
                        aria-label="Increase units"
                        onClick={() =>
                          setUnitCount((n) => Math.min(9999, n + 1))
                        }
                      >
                        +
                      </button>
                    </div>
                    {unitCount === 0 ? (
                      <p className="form-hint">
                        You can start at zero, add your first unit after signup.
                      </p>
                    ) : null}
                  </div>

                  <fieldset className="signup-fieldset">
                    <legend className="form-label">
                      How long have you managed rentals?
                    </legend>
                    {YEARS_OPTIONS.map((opt) => (
                      <label key={opt.value} className="signup-radio-row">
                        <input
                          type="radio"
                          name="signup_years"
                          value={opt.value}
                          checked={years === opt.value}
                          onChange={() => setYears(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              ) : null}

              {role === "tenant" ? (
                <div className="signup-qualify">
                  <label className="form-field">
                    <span className="form-label">
                      Landlord invite link{" "}
                      <span className="table-muted">(optional)</span>
                    </span>
                    <input
                      className="form-input"
                      value={claimCode}
                      onChange={(e) => setClaimCode(e.target.value)}
                      placeholder="Paste full invite link or token"
                      autoComplete="off"
                    />
                    <span className="form-help">
                      From your landlord: a link like /tenant/claim?token=…
                      (or just the token). Skip this if you will claim later.
                    </span>
                  </label>
                </div>
              ) : null}

              {role === "artisan" ? (
                <div className="signup-qualify">
                  <label className="form-field">
                    <span className="form-label">
                      Artisan invite code{" "}
                      <span className="table-muted">(optional)</span>
                    </span>
                    <input
                      className="form-input"
                      value={claimCode}
                      onChange={(e) => setClaimCode(e.target.value)}
                      placeholder="Paste code from the landlord invite"
                      autoComplete="off"
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">
                      Trades{" "}
                      <span className="table-muted">(optional)</span>
                    </span>
                    <input
                      className="form-input"
                      value={artisanTrades}
                      onChange={(e) => setArtisanTrades(e.target.value)}
                      placeholder="plumber, electrician"
                    />
                    <span className="form-help">
                      You can finish roster details when you claim the invite.
                    </span>
                  </label>
                </div>
              ) : null}

              {qualifyError ? <p className="form-error">{qualifyError}</p> : null}

              <div className="form-actions auth-actions signup-step-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep("role")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={goNextFromQualify}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === "account" ? (
            <>
              <label className="signup-terms signup-terms--block">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    setError(null);
                  }}
                />
                <span>
                  I agree to the {BRAND_NAME} terms of use and privacy notice
                  for this account.
                </span>
              </label>

              {!acceptedTerms ? (
                <p className="form-hint">
                  Accept the terms above to continue with phone or email signup.
                </p>
              ) : (
              <div className="form-card auth-card signup-auth-card">
                <div
                  className="auth-tabs"
                  role="tablist"
                  aria-label="Sign up method"
                >
                  <button
                    type="button"
                    role="tab"
                    className="auth-tab"
                    aria-selected={mode === "phone"}
                    onClick={() => selectMode("phone")}
                  >
                    Phone
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className="auth-tab"
                    aria-selected={mode === "email"}
                    onClick={() => selectMode("email")}
                  >
                    Email
                  </button>
                </div>

                {mode === "phone" ? (
                  <PhoneOtpFlow
                    key={`signup-phone-${inviteWhatsapp}-${role}-${persona}-${years}`}
                    purpose="signup"
                    showName
                    initialName={fullName || inviteName}
                    initialPhone={inviteWhatsapp}
                    userMetadata={signupMeta}
                    className="auth-tab-panel"
                    verifyLabel="Verify and continue"
                    onSuccess={() => {
                      void onPhoneSuccess();
                    }}
                  />
                ) : null}

                {mode === "email" ? (
                  <form className="auth-tab-panel" onSubmit={onEmailSubmit}>
                    {error ? <p className="form-error">{error}</p> : null}
                    {info ? <p className="form-success">{info}</p> : null}

                    <label className="form-field">
                      <span className="form-label">Full name</span>
                      <input
                        className="form-input"
                        name="full_name"
                        type="text"
                        required
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your name"
                      />
                    </label>

                    <label className="form-field">
                      <span className="form-label">Email</span>
                      <input
                        className="form-input"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="you@example.com"
                        defaultValue={defaultEmail}
                      />
                    </label>

                    <PasswordFields
                      password={password}
                      confirm={confirmPassword}
                      onPasswordChange={setPassword}
                      onConfirmChange={setConfirmPassword}
                      disabled={pending}
                      passwordLabel="Password"
                      confirmLabel="Confirm password"
                    />

                    <AuthCaptcha onToken={setCaptchaToken} />

                    <div className="form-actions auth-actions">
                      <button
                        className="btn-primary"
                        type="submit"
                        disabled={pending}
                      >
                        {pending ? "Creating…" : "Create account"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {mode === "phone" && error ? (
                  <p className="form-error">{error}</p>
                ) : null}
              </div>
              )}

              <div className="form-actions auth-actions signup-step-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep("qualify")}
                >
                  Back
                </button>
              </div>
            </>
          ) : null}
        </div>

        <aside
          className={
            role === "tenant"
              ? "signup-preview signup-preview--tenant"
              : role === "artisan"
                ? "signup-preview signup-preview--artisan"
                : "signup-preview signup-preview--landlord"
          }
          aria-hidden="true"
        >
          <p className="signup-preview-kicker">{previewKicker}</p>
          <h2 className="signup-preview-title">{previewTitle}</h2>
          <div className="signup-preview-stage">
            <div className="signup-preview-device">
              {role === "tenant" ? (
                <>
                  <p className="signup-preview-device-label">Amount due</p>
                  <p className="signup-preview-device-hero mono-data">
                    ₦450,000
                  </p>
                  <p className="signup-preview-device-muted">Rent · Flat 2B</p>
                  <div className="signup-preview-chip">Pay with Paystack</div>
                </>
              ) : null}
              {role === "artisan" ? (
                <>
                  <p className="signup-preview-device-label">Open jobs</p>
                  <p className="signup-preview-device-hero mono-data">2</p>
                  <p className="signup-preview-device-muted">
                    Plumbing · Lekki Court
                  </p>
                  <div className="signup-preview-chip">Update status</div>
                </>
              ) : null}
              {role === "landlord" ? (
                <>
                  <div className="signup-preview-stats">
                    <div>
                      <p className="signup-preview-device-muted">Collected</p>
                      <p className="signup-preview-stat mono-data">₦2.4m</p>
                    </div>
                    <div>
                      <p className="signup-preview-device-muted">Overdue</p>
                      <p className="signup-preview-stat mono-data">3 units</p>
                    </div>
                  </div>
                  <div className="signup-preview-list">
                    <div className="signup-preview-row">
                      <span>Flat 2B · Chioma</span>
                      <span className="signup-preview-pill">Paid</span>
                    </div>
                    <div className="signup-preview-row">
                      <span>Shop 1 · Ibrahim</span>
                      <span className="signup-preview-pill is-warn">Due</span>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
