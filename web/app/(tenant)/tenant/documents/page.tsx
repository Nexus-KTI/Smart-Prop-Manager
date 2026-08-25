"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { useToast } from "@/components/ToastProvider";
import {
  acknowledgeTenancyDocument,
  fetchMyTenancy,
  fetchTenancyDocuments,
} from "@/lib/api";

type DocRow = {
  id: string;
  doc_type: string;
  file_name: string;
  url?: string | null;
  expires_on?: string | null;
  requires_ack?: boolean;
  acknowledged_at?: string | null;
};

export default function TenantDocumentsPage() {
  const { showToast } = useToast();
  const [tenancyId, setTenancyId] = useState<string | null>(null);
  const [hasTenancy, setHasTenancy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<DocRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenancy = await fetchMyTenancy();
      if (!tenancy?.id || tenancy.status !== "active") {
        setHasTenancy(false);
        setTenancyId(null);
        setItems([]);
        setMessage(null);
        return;
      }
      setHasTenancy(true);
      setTenancyId(tenancy.id);
      const docs = await fetchTenancyDocuments(tenancy.id);
      setEnabled(docs.docs_upload_enabled);
      setItems(docs.items);
      setMessage(docs.message ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="page-subtitle">Loading documents…</p>;
  if (error) {
    return (
      <FetchErrorState
        title="Couldn’t load documents"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <h1 className="page-title">Your documents</h1>
      {!hasTenancy ? (
        <>
          <p className="page-subtitle">
            Documents unlock after your landlord links and activates your unit.
          </p>
          <Link href="/tenant/claim" className="btn-primary">
            Claim invite
          </Link>
        </>
      ) : (
        <>
          <p className="page-subtitle">
            {message ||
              "Documents belong to the landlord; Nexora stores them for this tenancy."}
          </p>
          {!enabled ? (
            <p className="table-muted">
              Document upload is currently off. You can still pay rent and download
              receipts.
            </p>
          ) : null}
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
                      <span className="table-muted"> · expires {doc.expires_on}</span>
                    ) : null}
                    {doc.requires_ack && !doc.acknowledged_at ? (
                      <span className="table-muted"> · needs acknowledgment</span>
                    ) : null}
                    {doc.acknowledged_at ? (
                      <span className="table-muted"> · acknowledged</span>
                    ) : null}
                  </span>
                  <span style={{ display: "flex", gap: 8 }}>
                    {doc.url ? (
                      <a href={doc.url} className="table-link" target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : null}
                    {doc.requires_ack && !doc.acknowledged_at && tenancyId ? (
                      <button
                        type="button"
                        className="table-link"
                        onClick={() =>
                          void acknowledgeTenancyDocument(tenancyId, doc.id)
                            .then(() => {
                              showToast("Document acknowledged");
                              return load();
                            })
                            .catch((err) =>
                              showToast(
                                err instanceof Error ? err.message : "Could not acknowledge",
                              ),
                            )
                        }
                      >
                        I acknowledge
                      </button>
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ul>
        </>
      )}
      <p style={{ marginTop: 16 }}>
        <Link href="/tenant" className="table-link">
          Back to home
        </Link>
      </p>
    </section>
  );
}
