"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import {
  activateTenancy,
  createUnitTenancy,
  fetchTenancyDocuments,
  fetchUnitTenancy,
  inviteTenant,
  updateTenancyChecklist,
  uploadTenancyDocument,
  type Tenancy,
} from "@/lib/api";
import { tenancyStatusLabel } from "@/lib/labels";

type Props = {
  unitId: string;
  propertyId: string;
  paymentsHref: string;
};

export function TenancyDossierClient({
  unitId,
  propertyId,
  paymentsHref,
}: Props) {
  const [tenancy, setTenancy] = useState<Tenancy | null>(null);
  const [docsMessage, setDocsMessage] = useState<string | null>(null);
  const [docsEnabled, setDocsEnabled] = useState(false);
  const [docItems, setDocItems] = useState<
    Array<{
      id: string;
      doc_type: string;
      file_name: string;
      url?: string | null;
      expires_on?: string | null;
      requires_ack?: boolean;
      acknowledged_at?: string | null;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requireAck, setRequireAck] = useState(false);
  const [expiresOn, setExpiresOn] = useState("");

  useEffect(() => {
    if (!invitePath) {
      setInviteUrl(null);
      return;
    }
    setInviteUrl(`${window.location.origin}${invitePath}`);
  }, [invitePath]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchUnitTenancy(unitId);
      setTenancy(row);
      if (row?.id) {
        const docs = await fetchTenancyDocuments(row.id);
        setDocsMessage(docs.message ?? null);
        setDocItems(docs.items);
        setDocsEnabled(docs.docs_upload_enabled);
      } else {
        setDocsMessage(null);
        setDocItems([]);
        setDocsEnabled(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenancy");
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureTenancy() {
    setBusy(true);
    setError(null);
    try {
      const row = await createUnitTenancy(unitId);
      setTenancy(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklist(key: string, done: boolean) {
    if (!tenancy) return;
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, boolean | string> = { [key]: !done };
      if (key === "checklist_identity_verified" && !done) {
        patch.identity_provider = "manual";
      }
      const row = await updateTenancyChecklist(tenancy.id, patch);
      setTenancy(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onActivate() {
    if (!tenancy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await activateTenancy(tenancy.id);
      setTenancy(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activate failed");
    } finally {
      setBusy(false);
    }
  }

  async function onInvite() {
    if (!tenancy) return;
    setBusy(true);
    setError(null);
    setInviteCopied(false);
    try {
      const result = await inviteTenant(tenancy.id);
      setTenancy(result.tenancy);
      setInvitePath(result.claim_path);
      if (result.invite_sent) {
        /* dossier uses same toast-free path; note via success class below */
      } else if (result.invite_error) {
        setError(`Link ready. Notify failed: ${result.invite_error}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
    } catch {
      setError("Could not copy link. Select it manually.");
    }
  }

  function shareWhatsApp() {
    if (!inviteUrl) return;
    const text = encodeURIComponent(
      `Claim your Nexora tenant invite to see rent and pay online:\n${inviteUrl}`,
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  async function onUpload(file: File, docType: string) {
    if (!tenancy) return;
    setBusy(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      await uploadTenancyDocument({
        tenancyId: tenancy.id,
        doc_type: docType,
        file_name: file.name,
        content_type: file.type || "application/pdf",
        content_base64: btoa(binary),
        expires_on: expiresOn || null,
        requires_ack: requireAck,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="page-subtitle">Loading tenancy…</p>;
  }

  if (error && !tenancy) {
    return (
      <FetchErrorState
        title="Couldn’t load tenancy"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <h1 className="page-title">Move-in checklist</h1>
          <p className="page-subtitle">
            <Link href={`/properties/${propertyId}`}>Property</Link>
            {" · "}
            Tick required steps before occupancy is active. Identity verify
            (NIN/BVN) stays optional.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href={paymentsHref} className="btn-secondary">
            Payments
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {!tenancy ? (
        <div className="dashboard-empty" role="status">
          <p className="dashboard-empty-title mono-data">No tenancy yet.</p>
          <p className="dashboard-empty-copy">
            Start a lease on this unit to track checklist, docs, and the tenant
            invite.
          </p>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void ensureTenancy()}
          >
            Start tenancy
          </button>
        </div>
      ) : (
        <>
          <p className="page-subtitle">
            Status:{" "}
            <span className="mono-data">{tenancyStatusLabel(tenancy.status)}</span>
            {tenancy.tenant_name ? ` · ${tenancy.tenant_name}` : null}
            {tenancy.tenant_contact ? ` · ${tenancy.tenant_contact}` : null}
          </p>

          <ul className="tenancy-check">
            {(tenancy.checklist || []).map((step) => (
              <li key={step.key}>
                <span
                  className="tenancy-check-dot"
                  data-done={step.done ? "true" : "false"}
                />
                <div>
                  <div>
                    {step.label}
                    {!step.required ? (
                      <span className="table-muted"> (optional)</span>
                    ) : null}
                  </div>
                  {step.note ? (
                    <p className="table-muted">{step.note}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void toggleChecklist(step.key, step.done)}
                >
                  {step.done ? "Undo" : step.required ? "Mark done" : "Confirm identity"}
                </button>
              </li>
            ))}
          </ul>

          <div className="form-card tenant-invite-panel" style={{ marginTop: 16 }}>
            <h2 className="page-title" style={{ fontSize: "1.1rem", margin: 0 }}>
              Tenant invite
            </h2>
            <p className="page-subtitle" style={{ margin: 0 }}>
              Send a one-time claim link. Your tenant signs in with the same
              phone/email on the unit, opens the link, and links this occupancy.
            </p>
            {!tenancy.tenant_contact ? (
              <p className="form-error">
                Add a tenant phone or WhatsApp on the unit first, then invite.{" "}
                <Link href={`/properties/${propertyId}`}>Edit property units</Link>
              </p>
            ) : null}
            <div className="dashboard-header-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={busy || tenancy.status === "active" || !tenancy.can_activate}
                onClick={() => void onActivate()}
              >
                Activate occupancy
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || !tenancy.tenant_contact}
                onClick={() => void onInvite()}
              >
                {invitePath ? "Resend invite link" : "Invite tenant"}
              </button>
            </div>
            {tenancy.activation_blockers && tenancy.activation_blockers.length > 0 ? (
              <p className="table-muted">
                Still needed: {tenancy.activation_blockers.join(", ")}
              </p>
            ) : null}
            {inviteUrl ? (
              <div className="tenant-invite-link-box">
                <p className="form-label">Claim link</p>
                <p className="mono-data tenant-invite-url">{inviteUrl}</p>
                <div className="dashboard-header-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void copyInviteLink()}
                  >
                    {inviteCopied ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={shareWhatsApp}
                  >
                    Share on WhatsApp
                  </button>
                </div>
                <p className="table-muted">
                  We also try SMS/email to {tenancy.tenant_contact} when notify
                  is configured.
                </p>
              </div>
            ) : null}
          </div>

          <h2 className="page-title" style={{ fontSize: "1.15rem", marginTop: 28 }}>
            Documents
          </h2>
          <p className="page-subtitle">
            {docsMessage ||
              tenancy.docs_belong_to_landlord ||
              "Documents belong to the landlord; Nexora stores them for this tenancy."}
          </p>
          {!docsEnabled ? (
            <p className="table-muted">
              Upload is off until landlord ToS/DPA is live (
              <span className="mono-data">NEXT_PUBLIC_DOCS_UPLOAD_ENABLED</span>
              ).
            </p>
          ) : (
            <div className="form-card" style={{ maxWidth: 420 }}>
              <label className="form-field">
                <span className="form-label">Expires on (optional)</span>
                <input
                  type="date"
                  className="form-input"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="form-field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={requireAck}
                  onChange={(e) => setRequireAck(e.target.checked)}
                  disabled={busy}
                />
                <span className="form-label" style={{ margin: 0 }}>
                  Require tenant acknowledgment
                </span>
              </label>
              <label className="form-field">
                <span className="form-label">Upload PDF (agreement / ID / other)</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void onUpload(file, "other");
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
          {docItems.length === 0 ? (
            <div className="dashboard-empty" role="status">
              <p className="dashboard-empty-title mono-data">No documents yet.</p>
              <p className="dashboard-empty-copy">
                Upload a PDF or photo above for the lease agreement or ID.
              </p>
            </div>
          ) : (
            <ul className="tenancy-doc-list">
              {docItems.map((doc) => (
                <li key={doc.id}>
                  <span>
                    {doc.file_name}{" "}
                    <span className="table-muted">({doc.doc_type})</span>
                  </span>
                  {doc.url ? (
                    <a href={doc.url} className="table-link" target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
