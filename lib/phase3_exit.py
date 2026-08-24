"""Phase 3 exit-criteria metrics from tenancies / transactions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_phase3_exit(
    db: Any,
    *,
    now: datetime | None = None,
    window_days: int = 30,
) -> dict[str, Any]:
    """
    Metric 1 — Checklist before active:
      % of tenancies activated in the window whose required checklist
      (ID / agreement / references) was complete at activation.
      Optional identity verify is tracked separately and does NOT gate.

    Metric 2 — Tenant-initiated payments:
      % of paid transactions (in window) on units with an activated tenant
      account that were initiated_by = 'tenant' (vs landlord manual/Paystack).
    """
    moment = _as_utc(now or datetime.now(timezone.utc))
    window_start = moment - timedelta(days=window_days)
    window_start_iso = window_start.isoformat()

    activated_rows = (
        db.table("tenancies")
        .select(
            "id, unit_id, landlord_id, activated_at, tenant_user_id, "
            "checklist_id_collected, checklist_agreement_signed, "
            "checklist_references_checked, checklist_identity_verified, status"
        )
        .eq("status", "active")
        .execute()
        .data
        or []
    )

    activated_in_window: list[dict[str, Any]] = []
    for row in activated_rows:
        raw = row.get("activated_at")
        if not raw:
            continue
        try:
            activated_at = _as_utc(
                datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            )
        except ValueError:
            continue
        if activated_at < window_start:
            continue
        activated_in_window.append(row)

    activated_count = len(activated_in_window)
    checklist_ok = 0
    identity_optional_done = 0
    for row in activated_in_window:
        required = (
            bool(row.get("checklist_id_collected"))
            and bool(row.get("checklist_agreement_signed"))
            and bool(row.get("checklist_references_checked"))
        )
        if required:
            checklist_ok += 1
        if row.get("checklist_identity_verified"):
            identity_optional_done += 1

    checklist_pct = (
        round(100.0 * checklist_ok / activated_count, 1) if activated_count else 0.0
    )

    # Units with activated tenant account (tenant_user_id set)
    tenant_linked_unit_ids = {
        str(row["unit_id"])
        for row in activated_rows
        if row.get("unit_id") and row.get("tenant_user_id")
    }

    txn_rows = (
        db.table("transactions")
        .select("id, unit_id, status, initiated_by, paid_at, created_at")
        .eq("status", "paid")
        .execute()
        .data
        or []
    )

    eligible = 0
    tenant_initiated = 0
    for row in txn_rows:
        unit_id = row.get("unit_id")
        if not unit_id or str(unit_id) not in tenant_linked_unit_ids:
            continue
        paid_raw = row.get("paid_at") or row.get("created_at")
        if not paid_raw:
            continue
        try:
            paid_at = _as_utc(
                datetime.fromisoformat(str(paid_raw).replace("Z", "+00:00"))
            )
        except ValueError:
            continue
        if paid_at < window_start:
            continue
        eligible += 1
        if (row.get("initiated_by") or "landlord") == "tenant":
            tenant_initiated += 1

    tenant_pay_pct = (
        round(100.0 * tenant_initiated / eligible, 1) if eligible else 0.0
    )

    return {
        "as_of": moment.isoformat(),
        "window_days": window_days,
        "window_start": window_start_iso,
        "metric_1_checklist_before_active": {
            "activated_tenancies": activated_count,
            "with_required_checklist": checklist_ok,
            "percent": checklist_pct,
            "optional_identity_complete": identity_optional_done,
            "definition": (
                "% of tenancies activated in the trailing window with required "
                "checklist (ID, agreement, references) complete. Optional "
                "NIN/BVN identity does not gate activation."
            ),
        },
        "metric_2_tenant_initiated_payments": {
            "eligible_paid_transactions": eligible,
            "tenant_initiated": tenant_initiated,
            "percent": tenant_pay_pct,
            "units_with_tenant_account": len(tenant_linked_unit_ids),
            "definition": (
                "% of paid transactions (trailing window) on units with an "
                "activated tenant account that have initiated_by='tenant'"
            ),
        },
    }


def format_phase3_exit_report(report: dict[str, Any]) -> str:
    m1 = report["metric_1_checklist_before_active"]
    m2 = report["metric_2_tenant_initiated_payments"]
    lines = [
        "Phase 3 exit check",
        f"  as_of: {report['as_of']}",
        f"  window: trailing {report['window_days']} days (from {report['window_start']})",
        "",
        "1. Checklist completed before occupancy active",
        f"  {m1['percent']}%  "
        f"({m1['with_required_checklist']} / {m1['activated_tenancies']} activated)",
        f"  optional identity done (not a gate): {m1['optional_identity_complete']}",
        f"  {m1['definition']}",
        "",
        "2. Tenant-initiated payments (vs landlord log)",
        f"  {m2['percent']}%  "
        f"({m2['tenant_initiated']} / {m2['eligible_paid_transactions']} "
        f"eligible paid txns; {m2['units_with_tenant_account']} units with tenant account)",
        f"  {m2['definition']}",
    ]
    return "\n".join(lines)
