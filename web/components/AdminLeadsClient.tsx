"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { LoadMoreButton } from "@/components/LoadMoreButton";
import { TableSkeleton } from "@/components/TableSkeleton";
import { useToast } from "@/components/ToastProvider";
import {
  fetchLeadsPage,
  inviteLead,
  updateLeadStatus,
  type Lead,
  type LeadStatus,
} from "@/lib/api";
import { LEAD_STATUS_LABELS, labelOrTitle } from "@/lib/labels";

const STATUSES: LeadStatus[] = ["new", "contacted", "invited", "closed"];

function formatWhen(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function whatsappHref(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

export function AdminLeadsClient() {
  const { showToast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadPage = useCallback(async (cursor?: string | null) => {
    const page = await fetchLeadsPage(cursor);
    setLeads((current) => (cursor ? [...current, ...page.items] : page.items));
    setNextCursor(page.next_cursor);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadPage(null);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load leads");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadPage]);

  const stats = useMemo(() => {
    const total = leads.length;
    const fresh = leads.filter((lead) => lead.status === "new").length;
    const contacted = leads.filter((lead) => lead.status === "contacted").length;
    return { total, fresh, contacted };
  }, [leads]);

  async function onLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more leads");
    } finally {
      setLoadingMore(false);
    }
  }

  async function onStatusChange(leadId: string, status: LeadStatus) {
    setUpdatingId(leadId);
    setError(null);
    try {
      const updated = await updateLeadStatus(leadId, status);
      setLeads((current) =>
        current.map((lead) => (lead.id === leadId ? updated : lead)),
      );
      showToast("Lead updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lead");
    } finally {
      setUpdatingId(null);
    }
  }

  async function onInvite(lead: Lead) {
    setUpdatingId(lead.id);
    setError(null);
    try {
      const result = await inviteLead(lead.id);
      setLeads((current) =>
        current.map((row) =>
          row.id === lead.id ? ({ ...row, ...result.lead } as Lead) : row,
        ),
      );
      try {
        await navigator.clipboard.writeText(result.invite_url);
      } catch {
        /* clipboard optional */
      }
      if (result.invite_sent) {
        showToast(
          `Invite queued via ${result.invite_channel ?? "SMS"}. Link copied. They must open the invite link to sign up.`,
        );
      } else {
        showToast(
          result.invite_error
            ? `Invite link copied, send failed: ${result.invite_error}`
            : "Invite link copied",
        );
        const wa = whatsappHref(lead.whatsapp);
        if (wa) {
          const text = encodeURIComponent(
            `You're invited to Nexora. Create your account: ${result.invite_url}`,
          );
          window.open(`${wa}?text=${text}`, "_blank", "noreferrer");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header">
        <h1 className="page-title">Access requests</h1>
        <p className="page-subtitle">
          Waitlist from the marketing page. Message on WhatsApp, then mark
          status when you invite them.
        </p>
      </header>

      <div className="stat-row">
        <div className="stat-block">
          <p className="stat-label">New (loaded)</p>
          <p className="stat-value mono-data">{loading ? "-" : stats.fresh}</p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Contacted (loaded)</p>
          <p className="stat-value mono-data">
            {loading ? "-" : stats.contacted}
          </p>
        </div>
        <div className="stat-block">
          <p className="stat-label">Loaded</p>
          <p className="stat-value mono-data">{loading ? "-" : stats.total}</p>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>WhatsApp</th>
              <th>Source</th>
              <th>Properties</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Invite</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={7} rows={6} />
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="table-empty">
                  No access requests yet.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const href = whatsappHref(lead.whatsapp);
                const status = lead.status ?? "new";
                return (
                  <tr key={lead.id}>
                    <td>{lead.name}</td>
                    <td className="mono-data">
                      {href ? (
                        <a
                          href={href}
                          className="table-link"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {lead.whatsapp}
                        </a>
                      ) : (
                        lead.whatsapp
                      )}
                    </td>
                    <td className="mono-data">
                      {labelOrTitle({}, lead.source ?? "access")}
                    </td>
                    <td className="mono-data">
                      {lead.unit_count == null ? "-" : lead.unit_count}
                    </td>
                    <td>
                      <select
                        className="admin-status-select"
                        value={status}
                        disabled={updatingId === lead.id}
                        onChange={(event) =>
                          onStatusChange(
                            lead.id,
                            event.target.value as LeadStatus,
                          )
                        }
                        aria-label={`Status for ${lead.name}`}
                      >
                        {STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {labelOrTitle(LEAD_STATUS_LABELS, value)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="mono-data">
                      {formatWhen(lead.created_at)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="settings-inline-link"
                        disabled={updatingId === lead.id}
                        onClick={() => void onInvite(lead)}
                      >
                        Send invite
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <LoadMoreButton
        hasMore={Boolean(nextCursor)}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </section>
  );
}
