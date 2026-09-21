"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { TenantAutopayCard } from "@/components/TenantAutopayCard";
import { TenantNoLeaseEmpty } from "@/components/TenantNoLeaseEmpty";
import {
  chargeSavedCard,
  createPendingPaystackPayment,
  confirmPaystackPayment,
  fetchMe,
  fetchMyTasks,
  fetchMyTenancy,
  fetchMyUtilities,
  fetchSavedCards,
  docsUploadEnabledClient,
  type OpsTask,
  type SavedPaymentMethod,
  type Tenancy,
} from "@/lib/api";
import { BRAND_NAME, supportWhatsAppUrl } from "@/lib/brand";
import { formatNaira } from "@/lib/dashboard";
import { tenancyStatusLabel } from "@/lib/labels";
import { useToast } from "@/components/ToastProvider";

const WELCOME_KEY = "nexora-tenant-welcome-seen";

function readWelcomeSeen(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return true;
  }
}

function markWelcomeSeen() {
  try {
    window.localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function TenantHomeClient() {
  const { showToast } = useToast();
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [hasUtilities, setHasUtilities] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedPaymentMethod[]>([]);
  const [payCardId, setPayCardId] = useState("");
  const [openTodos, setOpenTodos] = useState<OpsTask[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [row, me] = await Promise.all([fetchMyTenancy(), fetchMe()]);
      setTenancy(row);
      setProfileName(me.name || "");
      setProfileEmail(me.email);
      if (row?.status === "active") {
        try {
          const utils = await fetchMyUtilities();
          setHasUtilities(utils.length > 0);
        } catch {
          setHasUtilities(false);
        }
        try {
          const cards = await fetchSavedCards();
          setSavedCards(cards);
          if (row.autopay_payment_method_id) {
            setPayCardId(row.autopay_payment_method_id);
          } else if (cards[0]?.id) {
            setPayCardId(cards[0].id);
          }
        } catch {
          setSavedCards([]);
        }
        try {
          const tasks = await fetchMyTasks();
          setOpenTodos(
            tasks.filter((t) => {
              const s = (t.status || "").toLowerCase();
              return s !== "done" && s !== "canceled" && s !== "cancelled";
            }),
          );
        } catch {
          setOpenTodos([]);
        }
      } else {
        setHasUtilities(false);
        setSavedCards([]);
        setOpenTodos([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (!readWelcomeSeen()) setWelcomeOpen(true);
  }, [loading]);

  useEffect(() => {
    setSupportUrl(supportWhatsAppUrl());
  }, []);

  function dismissWelcome() {
    markWelcomeSeen();
    setWelcomeOpen(false);
  }

  async function copyHomeLink() {
    try {
      const url = `${window.location.origin}/tenant`;
      await navigator.clipboard.writeText(url);
      showToast("Home link copied. Save it or send to yourself");
    } catch {
      showToast("Could not copy link", "error");
    }
  }

  const unit = tenancy?.units;
  const propertyName = useMemo(() => {
    const props = unit?.properties;
    if (Array.isArray(props)) return props[0]?.name || "";
    return props?.name || "";
  }, [unit]);

  const rent = Number(unit?.rent_amount || 0);
  const sc = Number(unit?.service_charge_amount || 0);
  const due = rent + sc;
  const isActive = tenancy?.status === "active";
  const isLinkedPending = Boolean(tenancy && !isActive);

  async function payRent() {
    if (!tenancy?.unit_id || due <= 0 || !isActive) return;
    setPaying(true);
    setError(null);
    try {
      // Prefer saved card one-shot when selected.
      if (payCardId) {
        await chargeSavedCard({
          unit_id: tenancy.unit_id,
          payment_method_id: payCardId,
          amount: due,
          charge_type: "rent",
        });
        showToast("Rent paid with saved card");
        await load();
        setPaying(false);
        return;
      }

      const pending = await createPendingPaystackPayment({
        unit_id: tenancy.unit_id,
        amount: due,
        charge_type: "rent",
      });
      const txn = Array.isArray(pending) ? pending[0] : pending;
      const txnId = txn?.id;
      const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
      if (!publicKey || !txnId) {
        throw new Error("Paystack is not configured");
      }
      const { default: PaystackPop } = await import("@paystack/inline-js");
      const paystack = new PaystackPop();
      paystack.newTransaction({
        key: publicKey,
        email: profileEmail || "tenant@nexora.pay",
        amount: Math.round(due * 100),
        currency: "NGN",
        // Paystack documents `reference`; the bundled declaration omits it.
        // @ts-expect-error upstream @paystack/inline-js type gap
        reference: txn.payment_reference || undefined,
        metadata: { transaction_id: txnId, unit_id: tenancy.unit_id },
        onSuccess: (response: { reference: string }) => {
          void (async () => {
            try {
              await confirmPaystackPayment({
                unit_id: tenancy.unit_id,
                reference: response.reference,
                transaction_id: txnId,
              });
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Confirm failed");
            } finally {
              setPaying(false);
            }
          })();
        },
        onCancel: () => setPaying(false),
        onError: (err: { message?: string }) => {
          setError(err?.message || "Paystack checkout failed");
          setPaying(false);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pay failed");
      setPaying(false);
    }
  }

  const welcomeModal = welcomeOpen ? (
    <div className="tenant-welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="tenant-welcome-title">
      <div className="tenant-welcome-card onboarding-card">
        <button
          type="button"
          className="tenant-welcome-close"
          aria-label="Close"
          onClick={dismissWelcome}
        >
          ×
        </button>
        <p className="form-kicker">Tenant account</p>
        <h2 id="tenant-welcome-title" className="page-title">
          Welcome
        </h2>
        <p className="page-subtitle">
          Your {BRAND_NAME} account is ready. Claim your landlord invite, then
          pay and download receipts here, no separate app required.
        </p>
        <div className="form-actions auth-actions">
          <Link
            href="/tenant/claim"
            className="btn-primary"
            onClick={dismissWelcome}
          >
            Claim invite
          </Link>
          <button type="button" className="btn-secondary" onClick={dismissWelcome}>
            Done
          </button>
        </div>
        <div className="tenant-welcome-secondary">
          <button type="button" className="auth-alt-link" onClick={() => void copyHomeLink()}>
            Copy home link
          </button>
          <Link
            href="/tenant/settings"
            className="auth-alt-link"
            onClick={dismissWelcome}
          >
            Configure settings
          </Link>
          <Link
            href="/tenant/notices"
            className="auth-alt-link"
            onClick={dismissWelcome}
          >
            View notices
          </Link>
          {supportUrl ? (
            <a
              href={supportUrl}
              className="auth-alt-link"
              target="_blank"
              rel="noreferrer"
              onClick={dismissWelcome}
            >
              WhatsApp support
            </a>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  if (loading) {
    return (
      <>
        <p className="page-subtitle">Loading…</p>
        {welcomeModal}
      </>
    );
  }

  if (error && !tenancy) {
    return (
      <>
        <FetchErrorState
          title="Couldn’t load your rent"
          message={error}
          onRetry={() => void load()}
        />
        {welcomeModal}
      </>
    );
  }

  if (!tenancy) {
    return (
      <>
        <TenantNoLeaseEmpty
          profileName={profileName}
          profileEmail={profileEmail}
        />
        {welcomeModal}
      </>
    );
  }

  if (isLinkedPending) {
    return (
      <>
        <section className="dashboard">
          <p className="form-kicker">Linked</p>
          <h1 className="page-title">Almost there</h1>
          <p className="page-subtitle">
            You’re linked to{" "}
            {unit?.label ? (
              <span className="mono-data">{unit.label}</span>
            ) : (
              "your unit"
            )}
            {propertyName ? ` · ${propertyName}` : ""}. Your landlord still needs
            to activate occupancy before rent and receipts unlock.
          </p>
          <p className="form-success" role="status">
            Status: {tenancyStatusLabel(tenancy.status)}
          </p>
          <div className="dashboard-checklist" style={{ marginTop: 24 }}>
            <h2 className="dashboard-checklist-title">Getting started</h2>
            <ol className="dashboard-checklist-list">
              <li className="dashboard-checklist-item" data-state="complete">
                <span className="onboarding-step-dot" aria-hidden="true">
                  ✓
                </span>
                <span className="dashboard-checklist-label">Invite claimed</span>
              </li>
              <li className="dashboard-checklist-item" data-state="active">
                <span className="onboarding-step-dot" aria-hidden="true">
                  2
                </span>
                <span className="dashboard-checklist-label">
                  Landlord activates occupancy
                </span>
              </li>
              <li className="dashboard-checklist-item" data-state="upcoming">
                <span className="onboarding-step-dot" aria-hidden="true">
                  3
                </span>
                <span className="dashboard-checklist-label">Pay and get receipts</span>
              </li>
            </ol>
          </div>
          <div className="tenant-action-cards" aria-label="Waiting modules">
            <Link href="/tenant/utilities" className="tenant-action-card">
              <p className="tenant-action-card-title">Utilities</p>
              <p className="tenant-action-card-body">
                Unlock after occupancy is active, and only when your landlord
                sets providers up on their side.
              </p>
              <p className="tenant-action-card-cta">Check utilities →</p>
            </Link>
            <Link href="/tenant/requests" className="tenant-action-card">
              <p className="tenant-action-card-title">Repair requests</p>
              <p className="tenant-action-card-body">
                Same gate: active occupancy first, then honest empty until you
                submit a request.
              </p>
              <p className="tenant-action-card-cta">View requests →</p>
            </Link>
          </div>
        </section>
        {welcomeModal}
      </>
    );
  }

  return (
    <>
      <section className="dashboard">
        <p className="form-kicker">Tenant view</p>
        <h1 className="page-title">Your rent</h1>
        <p className="page-subtitle">
          {tenancy.tenant_name || "Tenant"}
          {unit?.label ? ` · ${unit.label}` : ""}
          {propertyName ? ` · ${propertyName}` : ""}
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="stat-row">
          <div className="stat-block">
            <p className="stat-label">Amount due</p>
            <p className="stat-value mono-data">{formatNaira(due)}</p>
            <p className="table-muted">
              {sc > 0 ? "Rent + service charge" : "Rent"}
            </p>
          </div>
        </div>
        <div className="dashboard-header-actions">
          {savedCards.length > 0 ? (
            <label className="form-field" style={{ margin: 0, minWidth: 160 }}>
              <span className="form-label">Pay with</span>
              <select
                className="form-input"
                value={payCardId}
                disabled={paying}
                onChange={(e) => setPayCardId(e.target.value)}
              >
                <option value="">New Paystack checkout</option>
                {savedCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.card_type || "Card").toUpperCase()} ···· {c.last4 || "????"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            disabled={paying || due <= 0}
            onClick={() => void payRent()}
          >
            {paying ? "Paying…" : payCardId ? "Pay with saved card" : "Pay rent"}
          </button>
          <Link href="/tenant/receipts" className="btn-secondary">
            Receipts
          </Link>
          {docsUploadEnabledClient() ? (
            <Link href="/tenant/documents" className="btn-secondary">
              Your documents
            </Link>
          ) : null}
        </div>
        <TenantAutopayCard
          tenancy={tenancy}
          onUpdated={setTenancy}
          onToast={showToast}
        />
        {openTodos.length > 0 ? (
          <div className="form-card" style={{ marginBottom: 16 }}>
            <p className="form-kicker">From your landlord</p>
            <h2 className="page-title" style={{ fontSize: "1.1rem" }}>
              {openTodos.length === 1
                ? "1 open to-do"
                : `${openTodos.length} open to-dos`}
            </h2>
            <ul className="stack-list" style={{ marginTop: 8 }}>
              {openTodos.slice(0, 3).map((t) => (
                <li key={t.id}>
                  <strong>{t.title}</strong>
                  {t.due_on ? (
                    <span className="table-muted"> · due {t.due_on}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12 }}>
              <Link href="/tenant/tasks" className="btn-secondary">
                Open to-dos
              </Link>
            </p>
          </div>
        ) : null}
        <div className="tenant-action-cards" aria-label="Landlord-originated tasks">
          <Link href="/tenant/utilities" className="tenant-action-card">
            <p className="tenant-action-card-title">
              {hasUtilities ? "Utilities ready" : "Set up utilities"}
            </p>
            <p className="tenant-action-card-body">
              {hasUtilities
                ? "Your landlord published providers for this unit, open Utilities for meter and pay notes."
                : "If your landlord invited you to turn on utilities for this unit, open the module to see setup status."}
            </p>
            <p className="tenant-action-card-cta">Open utilities →</p>
          </Link>
          <Link href="/tenant/requests" className="tenant-action-card">
            <p className="tenant-action-card-title">Report a repair</p>
            <p className="tenant-action-card-body">
              Submit a request with priority and access notes, your landlord
              sees it on this unit’s Payments page.
            </p>
            <p className="tenant-action-card-cta">Open requests →</p>
          </Link>
          <Link href="/tenant/access" className="tenant-action-card">
            <p className="tenant-action-card-title">Gate codes</p>
            <p className="tenant-action-card-body">
              View active access passes issued to your account.
            </p>
            <p className="tenant-action-card-cta">Open gate codes →</p>
          </Link>
        </div>
      </section>
      {welcomeModal}
    </>
  );
}
