"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useToast } from "@/components/ToastProvider";
import {
  activateTenancy,
  createUnitTenancy,
  fetchUnitTenancy,
  inviteTenant,
  type Tenancy,
} from "@/lib/api";

type Props = {
  unitId: string;
  propertyId?: string | null;
  tenantName?: string | null;
  tenantContact?: string | null;
  editUnitHref: string;
  tenancyHref?: string | null;
};

type InviteStatus = "none" | "not_invited" | "invite_sent" | "claimed" | "active";

function resolveStatus(tenancy: Tenancy | null): InviteStatus {
  if (!tenancy) return "none";
  if (tenancy.status === "active") return "active";
  if (tenancy.tenant_user_id) return "claimed";
  if (tenancy.invite_token || tenancy.invite_sent_at) return "invite_sent";
  return "not_invited";
}

const STATUS_LABEL: Record<InviteStatus, string> = {
  none: "No tenancy yet",
  not_invited: "Not invited",
  invite_sent: "Invite sent",
  claimed: "Claimed: activate occupancy",
  active: "Active",
};

export function UnitTenantInviteCard({
  unitId,
  propertyId,
  tenantName,
  tenantContact,
  editUnitHref,
  tenancyHref,
}: Props) {
  const { showToast } = useToast();
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimPath, setClaimPath] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notifyNote, setNotifyNote] = useState<string | null>(null);

  const contact = (tenantContact || tenancy?.tenant_contact || "").trim();
  const name = (tenantName || tenancy?.tenant_name || "").trim();
  const status = resolveStatus(tenancy);
  const dossierHref =
    tenancyHref ||
    (propertyId
      ? `/properties/${propertyId}/units/${unitId}/tenancy`
      : null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchUnitTenancy(unitId);
      setTenancy(row);
      if (row?.invite_token) {
        setClaimPath(`/tenant/claim?token=${row.invite_token}`);
      } else if (!row?.invite_token && row?.tenant_user_id) {
        setClaimPath(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invite status");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!claimPath) {
      setInviteUrl(null);
      return;
    }
    setInviteUrl(`${window.location.origin}${claimPath}`);
  }, [claimPath]);

  const statusTone = useMemo(() => {
    if (status === "active") return "paid";
    if (status === "claimed") return "overdue";
    if (status === "invite_sent") return "pending";
    return "overdue";
  }, [status]);

  async function ensureAndInvite() {
    setBusy(true);
    setError(null);
    setCopied(false);
    setNotifyNote(null);
    try {
      let row = tenancy;
      if (!row) {
        try {
          row = await createUnitTenancy(unitId, {});
        } catch (createErr) {
          // Race / stale UI: open tenancy may already exist.
          row = await fetchUnitTenancy(unitId);
          if (!row) {
            throw createErr instanceof Error
              ? createErr
              : new Error("Could not create tenancy");
          }
        }
        setTenancy(row);
      }
      const result = await inviteTenant(row.id);
      setTenancy(result.tenancy);
      setClaimPath(result.claim_path);
      if (result.invite_sent) {
        const ch = result.invite_channel || "notification";
        setNotifyNote(`Invite link created · ${ch} queued for ${contact}`);
        showToast(`Invite queued via ${ch}`);
      } else {
        setNotifyNote(
          result.invite_error
            ? `Link ready. Notify failed: ${result.invite_error}`
            : "Link ready. Copy or WhatsApp it yourself (notify not configured).",
        );
        showToast("Invite link ready");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function onActivate() {
    if (!tenancy) return;
    setBusy(true);
    setError(null);
    setNotifyNote(null);
    try {
      const row = await activateTenancy(tenancy.id);
      setTenancy(row);
      setClaimPath(null);
      setNotifyNote(
        "Occupancy active. Tenant can see rent and pay from their home.",
      );
      showToast(
        name
          ? `${name} unlocked. Tenant can pay now`
          : "Occupancy active. Tenant can pay now",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate occupancy");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      showToast("Claim link copied");
    } catch {
      setError("Could not copy. Select the link manually.");
    }
  }

  function shareWhatsApp() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(
      `Claim your Nexora tenant invite to see rent and pay online:\n${inviteUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="form-card unit-tenant-invite">
      <div className="unit-tenant-invite-head">
        <div>
          <h2 className="unit-tenant-invite-title">Tenant invite</h2>
          <p className="page-subtitle" style={{ margin: 0 }}>
            {name ? `${name} · ` : ""}
            {contact || "No phone/WhatsApp on this unit"}
          </p>
        </div>
        {!loading ? (
          <span className={`status-badge ${statusTone}`}>{STATUS_LABEL[status]}</span>
        ) : (
          <span className="table-muted">Loading…</span>
        )}
      </div>

      {status === "claimed" ? (
        <p className="unit-tenant-claim-nudge" role="status">
          {name || "Tenant"} claimed the invite. Activate occupancy to unlock
          their rent balance and Paystack pay.
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {notifyNote ? <p className="form-success">{notifyNote}</p> : null}

      {!contact ? (
        <p className="table-muted">
          Add tenant contact on{" "}
          <Link href={editUnitHref} className="table-link">
            Edit unit
          </Link>{" "}
          before inviting.
        </p>
      ) : null}

      {status === "claimed" &&
      tenancy?.activation_blockers &&
      tenancy.activation_blockers.length > 0 ? (
        <p className="table-muted">
          Checklist still needed: {tenancy.activation_blockers.join(", ")}.{" "}
          {dossierHref ? (
            <Link href={dossierHref} className="table-link">
              Open dossier
            </Link>
          ) : null}
        </p>
      ) : null}

      <div className="dashboard-header-actions">
        {status === "claimed" ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || tenancy?.can_activate === false}
            onClick={() => void onActivate()}
          >
            {busy ? "Activating…" : "Activate occupancy"}
          </button>
        ) : null}
        <button
          type="button"
          className={status === "claimed" ? "btn-secondary" : "btn-primary"}
          disabled={busy || !contact || status === "active"}
          onClick={() => void ensureAndInvite()}
        >
          {busy && status !== "claimed"
            ? "Working…"
            : status === "invite_sent" || status === "claimed"
              ? "Resend invite link"
              : status === "none"
                ? "Start tenancy & invite"
                : "Invite tenant"}
        </button>
        {dossierHref ? (
          <Link href={dossierHref} className="btn-secondary">
            Tenancy dossier
          </Link>
        ) : null}
      </div>

      {inviteUrl && status !== "active" && status !== "claimed" ? (
        <div className="tenant-invite-link-box">
          <p className="form-label">Claim link</p>
          <p className="mono-data tenant-invite-url">{inviteUrl}</p>
          <div className="dashboard-header-actions">
            <button type="button" className="btn-secondary" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <button type="button" className="btn-secondary" onClick={shareWhatsApp}>
              Share on WhatsApp
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
