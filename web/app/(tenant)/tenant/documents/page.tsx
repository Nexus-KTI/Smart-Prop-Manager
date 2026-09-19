"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { useToast } from "@/components/ToastProvider";
import {
  acknowledgeTenancyDocument,
  createTenancyPrivacyRequest,
  fetchMyTenancies,
  fetchTenancyDocumentRequests,
  fetchTenancyDocuments,
  fetchTenancyPrivacyCasePolicies,
  fetchTenancyPrivacyRequests,
  openTenancyDocument,
  submitRequestedTenancyDocument,
  type DocumentCollectionCapabilities,
  type Tenancy,
  type TenancyDocumentRequest,
  type TenancyPrivacyCasePolicy,
  type TenancyPrivacyRequest,
} from "@/lib/api";
import {
  DOCUMENT_REQUEST_STATUS_LABELS,
  PRIVACY_REQUEST_STATUS_LABELS,
  labelOrTitle,
} from "@/lib/labels";

type DocRow = {
  id: string;
  doc_type: string;
  file_name: string;
  url?: string | null;
  can_open?: boolean;
  expires_on?: string | null;
  requires_ack?: boolean;
  acknowledged_at?: string | null;
  acknowledgment_text_version?: string | null;
  scan_status?: "pending" | "clean" | "rejected";
};

const NO_COLLECTION_CAPABILITIES: DocumentCollectionCapabilities = {
  request: false,
  cancel_request: false,
  submit_requested: false,
  replace: false,
  review: false,
  open: false,
  privacy_request: false,
};

export default function TenantDocumentsPage() {
  const { showToast } = useToast();
  const [tenancyId, setTenancyId] = useState<string | null>(null);
  const [linkedTenancies, setLinkedTenancies] = useState<Tenancy[]>([]);
  const [hasTenancy, setHasTenancy] = useState(true);
  const [tenancyPending, setTenancyPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<DocRow[]>([]);
  const [canRead, setCanRead] = useState(false);
  const [canAcknowledge, setCanAcknowledge] = useState(false);
  const [collectionCapabilities, setCollectionCapabilities] =
    useState<DocumentCollectionCapabilities>(NO_COLLECTION_CAPABILITIES);
  const [documentRequests, setDocumentRequests] = useState<
    TenancyDocumentRequest[]
  >([]);
  const [noticeOpened, setNoticeOpened] = useState<Record<string, boolean>>({});
  const [noticeRead, setNoticeRead] = useState<Record<string, boolean>>({});
  const [uploadingRequest, setUploadingRequest] = useState<string | null>(null);
  const [privacyRequests, setPrivacyRequests] = useState<
    TenancyPrivacyRequest[]
  >([]);
  const [privacyPolicies, setPrivacyPolicies] = useState<
    TenancyPrivacyCasePolicy[]
  >([]);
  const [privacyType, setPrivacyType] =
    useState<TenancyPrivacyRequest["request_type"]>("access");
  const [privacySubmitting, setPrivacySubmitting] = useState(false);
  const privacySubmittingRef = useRef(false);
  const privacyIdempotencyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (targetTenancyId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const tenancies = await fetchMyTenancies();
      setLinkedTenancies(tenancies);
      const tenancy =
        tenancies.find((item) => item.id === targetTenancyId) ||
        tenancies.find((item) => item.status === "active") ||
        tenancies[0];
      if (!tenancy?.id) {
        setHasTenancy(false);
        setTenancyPending(false);
        setTenancyId(null);
        setItems([]);
        setCanRead(false);
        setCanAcknowledge(false);
        setCollectionCapabilities(NO_COLLECTION_CAPABILITIES);
        setDocumentRequests([]);
        setPrivacyRequests([]);
        setPrivacyPolicies([]);
        setMessage(null);
        return;
      }
      const [privacy, privacyPolicyRows] = await Promise.all([
        fetchTenancyPrivacyRequests(tenancy.id),
        fetchTenancyPrivacyCasePolicies(tenancy.id),
      ]);
      setPrivacyRequests(privacy.items);
      setPrivacyPolicies(privacyPolicyRows);
      if (tenancy.status !== "active") {
        const isPending =
          tenancy.status === "draft" || tenancy.status === "pending_verification";
        const requests = isPending
          ? await fetchTenancyDocumentRequests(tenancy.id)
          : {
              capabilities: privacy.capabilities,
              items: [] as TenancyDocumentRequest[],
              message: "This occupancy has ended.",
            };
        setHasTenancy(true);
        setTenancyPending(isPending);
        setTenancyId(tenancy.id);
        setItems([]);
        setCanRead(false);
        setCanAcknowledge(false);
        setCollectionCapabilities(requests.capabilities);
        setDocumentRequests(requests.items);
        setMessage(requests.message ?? null);
        return;
      }
      setHasTenancy(true);
      setTenancyPending(false);
      setTenancyId(tenancy.id);
      const docs = await fetchTenancyDocuments(tenancy.id);
      setCanRead(docs.capabilities.read);
      setCanAcknowledge(docs.capabilities.acknowledge);
      setItems(docs.items);
      setCollectionCapabilities(privacy.capabilities);
      setDocumentRequests([]);
      setMessage(docs.message ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submitRequestedFile(
    item: TenancyDocumentRequest,
    file: File,
  ) {
    if (!tenancyId) return;
    if (file.size === 0 || file.size > 8 * 1024 * 1024) {
      showToast("Choose a non-empty document no larger than 8 MB.", "error");
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      showToast("Only PDF, JPEG, and PNG documents are allowed.", "error");
      return;
    }
    if (!noticeRead[item.id] || !item.policy) {
      showToast("Read the collection notice before uploading.", "error");
      return;
    }
    const latest = item.submissions.find(
      (submission) => submission.id === item.current_submission_id,
    );
    setUploadingRequest(item.id);
    try {
      await submitRequestedTenancyDocument({
        tenancyId,
        requestId: item.id,
        document: file,
        noticeVersion: item.policy.privacy_notice_version,
        replacesSubmissionId:
          item.status === "changes_requested" ? latest?.id ?? null : null,
        idempotencyKey: crypto.randomUUID(),
      });
      showToast("Document sent for landlord review");
      await load(tenancyId);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not submit document",
        "error",
      );
    } finally {
      setUploadingRequest(null);
    }
  }

  async function openDocument(documentId: string) {
    if (!tenancyId) return;
    try {
      const result = await openTenancyDocument(tenancyId, documentId);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not open document",
        "error",
      );
    }
  }

  async function submitPrivacyRequest() {
    if (
      !tenancyId ||
      !privacyPolicies[0] ||
      privacySubmittingRef.current
    ) {
      return;
    }
    privacySubmittingRef.current = true;
    setPrivacySubmitting(true);
    const idempotencyKey =
      privacyIdempotencyRef.current || crypto.randomUUID();
    privacyIdempotencyRef.current = idempotencyKey;
    try {
      await createTenancyPrivacyRequest(
        tenancyId,
        {
          request_type: privacyType,
          privacy_policy_version: privacyPolicies[0].version,
        },
        idempotencyKey,
      );
      privacyIdempotencyRef.current = null;
      showToast("Privacy request received");
      await load(tenancyId);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not submit privacy request",
        "error",
      );
    } finally {
      privacySubmittingRef.current = false;
      setPrivacySubmitting(false);
    }
  }

  if (loading) return <p className="page-subtitle">Loading documents…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load documents"
        message={error}
        onRetry={() => void load(tenancyId)}
      />
    );
  }

  return (
    <section className="dashboard">
      <h1 className="page-title">Your documents</h1>
      {linkedTenancies.length > 1 ? (
        <label className="form-field" style={{ maxWidth: 420 }}>
          <span className="form-label">Occupancy record</span>
          <select
            className="form-input"
            value={tenancyId || ""}
            onChange={(event) => void load(event.target.value)}
          >
            {linkedTenancies.map((item) => {
              const properties = item.units?.properties;
              const propertyName = Array.isArray(properties)
                ? properties[0]?.name
                : properties?.name;
              return (
                <option key={item.id} value={item.id}>
                  {[propertyName, item.units?.label, item.status]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              );
            })}
          </select>
        </label>
      ) : null}
      {!hasTenancy ? (
        <>
          <p className="page-subtitle">
            Documents unlock after your landlord links and activates your unit.
          </p>
          <Link href="/tenant/claim" className="btn-primary">
            Claim invite
          </Link>
        </>
      ) : tenancyPending ? (
        <>
          <p className="page-subtitle">
            {message ||
              "Your invite is linked. Requested agreements and references appear here before move-in."}
          </p>
          {!collectionCapabilities.submit_requested ? (
            <div className="dashboard-empty" role="status">
              <p className="dashboard-empty-title">
                Requested document uploads are not available yet.
              </p>
              <p className="dashboard-empty-copy">
                This capability remains off pending legal and privacy approval.
              </p>
            </div>
          ) : documentRequests.length === 0 ? (
            <div className="dashboard-empty" role="status">
              <p className="dashboard-empty-title">No document requests.</p>
              <p className="dashboard-empty-copy">
                Your landlord has not requested an agreement or reference.
              </p>
            </div>
          ) : (
            <ul className="tenancy-doc-list">
              {documentRequests.map((item) => {
                const latest = item.submissions.find(
                  (submission) => submission.id === item.current_submission_id,
                );
                const changeEvent = item.events
                  .filter((event) => event.event_type === "changes_requested")
                  .at(-1);
                const canSubmit =
                  item.status === "open" || item.status === "changes_requested";
                return (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>{" "}
                      <span className="table-muted">
                        ({item.doc_type}) ·{" "}
                        {labelOrTitle(
                          DOCUMENT_REQUEST_STATUS_LABELS,
                          item.status,
                        )}
                      </span>
                      {item.instructions ? (
                        <p className="table-muted">{item.instructions}</p>
                      ) : null}
                      {item.due_on ? (
                        <p className="table-muted mono-data">
                          Requested by {item.due_on}
                        </p>
                      ) : null}
                      {changeEvent ? (
                        <p className="form-error">
                          {changeEvent.reason_code
                            ? `${labelOrTitle({}, changeEvent.reason_code)}: `
                            : ""}
                          {changeEvent.comment || "Please submit a replacement."}
                        </p>
                      ) : null}
                      {item.policy ? (
                        <div className="form-card">
                          <p className="form-label">Why this is collected</p>
                          <p className="table-muted">
                            Purpose:{" "}
                            {labelOrTitle({}, item.policy.purpose_code)} · lawful
                            basis recorded as{" "}
                            {labelOrTitle({}, item.policy.lawful_basis)}.
                          </p>
                          <a
                            className="table-link"
                            href={item.policy.privacy_notice_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() =>
                              setNoticeOpened((current) => ({
                                ...current,
                                [item.id]: true,
                              }))
                            }
                          >
                            Read privacy notice {item.policy.privacy_notice_version}
                          </a>
                          {canSubmit ? (
                            <label
                              className="form-field"
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <input
                                type="checkbox"
                                disabled={!noticeOpened[item.id]}
                                checked={Boolean(noticeRead[item.id])}
                                onChange={(event) =>
                                  setNoticeRead((current) => ({
                                    ...current,
                                    [item.id]: event.target.checked,
                                  }))
                                }
                              />
                              <span className="table-muted">
                                I opened the notice shown above. This records
                                presentation, not consent.
                              </span>
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                      {item.submissions.length > 0 ? (
                        <p className="table-muted">
                          Versions:{" "}
                          {item.submissions
                            .slice()
                            .reverse()
                            .map(
                              (submission) =>
                                `v${submission.version} ${labelOrTitle(
                                  DOCUMENT_REQUEST_STATUS_LABELS,
                                  submission.review_status,
                                )}`,
                            )
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <span style={{ display: "flex", gap: 8 }}>
                      {latest?.document ? (
                        <button
                          type="button"
                          className="table-link"
                          onClick={() => void openDocument(latest.document!.id)}
                        >
                          Open latest
                        </button>
                      ) : null}
                      {canSubmit ? (
                        <label className="btn-primary">
                          {uploadingRequest === item.id
                            ? "Uploading…"
                            : item.status === "changes_requested"
                              ? "Upload replacement"
                              : "Upload document"}
                          <input
                            type="file"
                            hidden
                            accept="application/pdf,image/jpeg,image/png"
                            disabled={
                              uploadingRequest !== null ||
                              !noticeRead[item.id] ||
                              !item.policy
                            }
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void submitRequestedFile(item, file);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="page-subtitle">
            {message ||
              "Documents belong to the landlord; Nexora stores them for this tenancy."}
          </p>
          {canRead ? (
            <p className="table-muted">
              Acknowledgment records receipt/read status; it is not a legal
              signature.
            </p>
          ) : null}
          {!canRead ? (
            <div className="dashboard-empty" role="status">
              <p className="dashboard-empty-title">
                Secure documents are not available yet.
              </p>
              <p className="dashboard-empty-copy">
                You can still pay rent and download receipts.
              </p>
            </div>
          ) : (
            <ul className="tenancy-doc-list">
              {items.length === 0 ? (
                <li className="table-muted">No documents shared yet.</li>
              ) : (
                items.map((doc) => (
                  <li key={doc.id}>
                    <span>
                      {doc.file_name}{" "}
                      <span className="table-muted">({doc.doc_type})</span>
                      {doc.expires_on ? (
                        <span className="table-muted">
                          {" "}
                          · expires {doc.expires_on}
                        </span>
                      ) : null}
                      {doc.requires_ack && !doc.acknowledged_at ? (
                        <span className="table-muted">
                          {" "}
                          · needs receipt acknowledgment
                        </span>
                      ) : null}
                      {doc.acknowledged_at ? (
                        <span className="table-muted">
                          {" "}
                          · receipt acknowledged
                        </span>
                      ) : null}
                    </span>
                    <span style={{ display: "flex", gap: 8 }}>
                      {doc.can_open ? (
                        <button
                          type="button"
                          className="table-link"
                          onClick={() => void openDocument(doc.id)}
                        >
                          Open
                        </button>
                      ) : null}
                      {canAcknowledge &&
                      doc.requires_ack &&
                      !doc.acknowledged_at &&
                      tenancyId ? (
                        <button
                          type="button"
                          className="table-link"
                          onClick={() =>
                            void acknowledgeTenancyDocument(tenancyId, doc.id)
                              .then(() => {
                                showToast("Receipt acknowledged");
                                return load(tenancyId);
                              })
                              .catch((err) =>
                                showToast(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not acknowledge receipt",
                                  "error",
                                ),
                              )
                          }
                        >
                          Acknowledge receipt
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
      {hasTenancy ? (
        <div className="form-card" style={{ marginTop: 20 }}>
          <h2 className="page-title" style={{ fontSize: "1.1rem", margin: 0 }}>
            Privacy requests
          </h2>
          <p className="table-muted">
            Ask for access, correction, erasure review, restriction, objection,
            or portability. Requests are reviewed; submitting one does not
            automatically delete records or third-party information.
          </p>
          {collectionCapabilities.privacy_request && privacyPolicies[0] ? (
            <>
              <p className="table-muted">
                Read{" "}
                <a
                  className="table-link"
                  href={privacyPolicies[0].notice_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  privacy request notice {privacyPolicies[0].notice_version}
                </a>{" "}
                before submitting.
              </p>
              <div className="dashboard-header-actions">
                <select
                  className="form-input"
                  value={privacyType}
                  onChange={(event) =>
                    {
                      privacyIdempotencyRef.current = null;
                      setPrivacyType(
                        event.target.value as TenancyPrivacyRequest["request_type"],
                      );
                    }
                  }
                >
                  <option value="access">Access</option>
                  <option value="rectification">Correction</option>
                  <option value="erasure">Erasure review</option>
                  <option value="restriction">Restrict processing</option>
                  <option value="objection">Object</option>
                  <option value="portability">Portability</option>
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={privacySubmitting}
                  onClick={() => void submitPrivacyRequest()}
                >
                  {privacySubmitting ? "Submitting…" : "Submit privacy request"}
                </button>
              </div>
            </>
          ) : (
            <p className="table-muted">
              In-product privacy request intake is awaiting approved policy.
              Contact support for privacy assistance.
            </p>
          )}
          {privacyRequests.length > 0 ? (
            <ul className="tenancy-doc-list">
              {privacyRequests.map((item) => (
                <li key={item.id}>
                  <span>
                    {labelOrTitle({}, item.request_type)}{" "}
                    <span className="table-muted">
                      ·{" "}
                      {labelOrTitle(
                        PRIVACY_REQUEST_STATUS_LABELS,
                        item.status,
                      )}
                      {item.due_on ? ` · review date ${item.due_on}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <p style={{ marginTop: 16 }}>
        <Link href="/tenant" className="table-link">
          Back to home
        </Link>
      </p>
    </section>
  );
}
