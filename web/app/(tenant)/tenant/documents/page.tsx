"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { fetchMyTenancy, fetchTenancyDocuments } from "@/lib/api";

export default function TenantDocumentsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<
    Array<{ id: string; doc_type: string; file_name: string; url?: string | null }>
  >([]);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenancy = await fetchMyTenancy();
      if (!tenancy?.id) {
        setItems([]);
        setMessage("No active tenancy.");
        return;
      }
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
              </span>
              {doc.url ? (
                <a href={doc.url} className="table-link" target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : null}
            </li>
          ))
        )}
      </ul>
      <p style={{ marginTop: 16 }}>
        <Link href="/tenant" className="table-link">
          Back to your rent
        </Link>
      </p>
    </section>
  );
}
