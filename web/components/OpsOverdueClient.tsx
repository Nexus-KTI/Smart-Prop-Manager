"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FetchErrorState } from "@/components/FetchErrorState";
import { useToast } from "@/components/ToastProvider";
import { fetchOpsOverdue, sendReminder } from "@/lib/api";
import { formatNaira, resolveUnitStatus } from "@/lib/dashboard";
import type { Transaction, Unit } from "@/lib/types";

type OpsRow = {
  unit: Unit;
  property_id: string;
  property_name: string;
  owner_id: string;
  transactions: Transaction[];
};

export function OpsOverdueClient() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<OpsRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOpsOverdue();
      setRows(
        data.items.map((item) => ({
          ...item,
          unit: {
            ...item.unit,
            transactions: item.transactions,
          },
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ops");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overdue = useMemo(() => {
    return rows
      .map((row) => {
        const status = resolveUnitStatus(row.unit, row.transactions || []);
        return { ...row, status };
      })
      .filter((row) => row.status === "OVERDUE");
  }, [rows]);

  async function onRemind(row: OpsRow) {
    const contact = (row.unit.tenant_contact || "").trim();
    if (!contact) {
      setError("No tenant contact on this unit. Add one on Edit unit first.");
      return;
    }
    setBusyId(row.unit.id);
    setError(null);
    try {
      await sendReminder({
        unit_id: row.unit.id,
        contact,
        message: `Rent reminder for ${row.property_name} · ${row.unit.label}`,
      });
      showToast(`Reminder sent for ${row.unit.label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reminder failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="page-subtitle">Loading overdue…</p>;
  if (error && rows.length === 0) {
    return (
      <FetchErrorState
        title="Couldn’t load chase ops"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <section className="dashboard">
      <header className="dashboard-header dashboard-header-row">
        <div>
          <p className="form-kicker">Manager view</p>
          <h1 className="page-title">Who owes across owners</h1>
          <p className="page-subtitle">
            Overdue units in the active portfolio, send a reminder or open the
            unit.
          </p>
        </div>
        <div className="dashboard-header-actions">
          <Link href="/portfolios" className="btn-secondary">
            Switch owner
          </Link>
          <Link href="/settings/team" className="btn-secondary">
            Team
          </Link>
        </div>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="osx-stack" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {overdue.length === 0 ? (
          <div className="dashboard-empty">
            <p className="page-title" style={{ fontSize: "1.15rem" }}>
              No overdue units
            </p>
            <p className="page-subtitle">
              When rent is past due in this portfolio, chase from here or
              Reminders.
            </p>
            <div className="dashboard-header-actions">
              <Link href="/reminders" className="btn-primary">
                Open reminders
              </Link>
              <Link href="/properties" className="btn-secondary">
                Properties
              </Link>
            </div>
          </div>
        ) : (
          overdue.map((row) => {
            const contact = (row.unit.tenant_contact || "").trim();
            const noContact = !contact;
            return (
              <div
                key={row.unit.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <div>
                    {row.unit.label} · {row.property_name}
                  </div>
                  <div className="table-muted">
                    <span className="mono-data">
                      {formatNaira(Number(row.unit.rent_amount) || 0)}
                    </span>{" "}
                    · overdue
                    {noContact ? " · no tenant contact" : ""}
                  </div>
                </div>
                <div className="dashboard-header-actions">
                  <Link href={`/payments/${row.unit.id}`} className="table-link">
                    Record payment
                  </Link>
                  {noContact ? (
                    <Link
                      href={`/properties/units/${row.unit.id}/edit`}
                      className="btn-secondary"
                    >
                      Add contact
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === row.unit.id}
                      onClick={() => void onRemind(row)}
                    >
                      {busyId === row.unit.id ? "Sending…" : "Send reminder"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
