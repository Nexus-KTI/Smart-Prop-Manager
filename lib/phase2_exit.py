"""Phase 2 exit-criteria metrics from transactions / units / product_events."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

RENEWAL_BANNER_EVENT = "renewal_banner_viewed"


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_phase2_exit(
    db: Any,
    *,
    now: datetime | None = None,
    window_days: int = 30,
) -> dict[str, Any]:
    """
    Metric 1 — Non-rent collection:
      % of active landlords (owners with ≥1 unit) who have ≥1 PAID
      transaction with charge_type != 'rent' in the trailing window.

    Metric 2 — Renewal visibility:
      % of occupied units (tenant_contact set) with term_end populated.

    Metric 2b — Renewal banner attention:
      Count of renewal_banner_viewed events in the same trailing window
      (and distinct landlords / units), for honesty that term_end alone
      ≠ “landlord saw the banner.”
    """
    moment = _as_utc(now or datetime.now(timezone.utc))
    window_start = moment - timedelta(days=window_days)
    window_start_iso = window_start.isoformat()

    active_rows = (
        db.table("phase2_active_landlords").select("landlord_id").execute().data
        or []
    )
    active_landlord_ids = {
        str(row["landlord_id"])
        for row in active_rows
        if row.get("landlord_id")
    }
    active_landlords = len(active_landlord_ids)

    # Paid non-rent in window → map unit_id → then to owner via properties.
    txn_rows = (
        db.table("transactions")
        .select("unit_id, charge_type, status, paid_at, created_at")
        .eq("status", "paid")
        .neq("charge_type", "rent")
        .execute()
        .data
        or []
    )

    non_rent_unit_ids: set[str] = set()
    for row in txn_rows:
        paid_raw = row.get("paid_at") or row.get("created_at")
        if not paid_raw:
            continue
        try:
            paid_at = _as_utc(datetime.fromisoformat(str(paid_raw).replace("Z", "+00:00")))
        except ValueError:
            continue
        if paid_at < window_start:
            continue
        unit_id = row.get("unit_id")
        if unit_id:
            non_rent_unit_ids.add(str(unit_id))

    landlords_with_non_rent: set[str] = set()
    if non_rent_unit_ids:
        # Batch unit → property → owner
        unit_rows = (
            db.table("units")
            .select("id, properties!inner(owner_id)")
            .in_("id", list(non_rent_unit_ids))
            .execute()
            .data
            or []
        )
        for row in unit_rows:
            prop = row.get("properties") or {}
            if isinstance(prop, list):
                prop = prop[0] if prop else {}
            owner_id = prop.get("owner_id")
            if owner_id and str(owner_id) in active_landlord_ids:
                landlords_with_non_rent.add(str(owner_id))

    non_rent_landlord_count = len(landlords_with_non_rent)
    non_rent_pct = (
        round(100.0 * non_rent_landlord_count / active_landlords, 1)
        if active_landlords
        else 0.0
    )

    occupied_rows = (
        db.table("phase2_occupied_units")
        .select("unit_id, term_end")
        .execute()
        .data
        or []
    )
    occupied_units = len(occupied_rows)
    occupied_with_term_end = sum(
        1 for row in occupied_rows if row.get("term_end")
    )
    term_end_pct = (
        round(100.0 * occupied_with_term_end / occupied_units, 1)
        if occupied_units
        else 0.0
    )

    event_rows = (
        db.table("product_events")
        .select("landlord_id, unit_id, created_at")
        .eq("event_name", RENEWAL_BANNER_EVENT)
        .gte("created_at", window_start_iso)
        .execute()
        .data
        or []
    )
    banner_views = len(event_rows)
    banner_landlords = len(
        {str(r["landlord_id"]) for r in event_rows if r.get("landlord_id")}
    )
    banner_units = len(
        {str(r["unit_id"]) for r in event_rows if r.get("unit_id")}
    )

    return {
        "as_of": moment.isoformat(),
        "window_days": window_days,
        "window_start": window_start_iso,
        "metric_1_non_rent_collection": {
            "active_landlords": active_landlords,
            "landlords_with_paid_non_rent": non_rent_landlord_count,
            "percent": non_rent_pct,
            "definition": (
                "% of landlords with >=1 unit who have >=1 PAID transaction "
                f"with charge_type != 'rent' in the trailing {window_days} days"
            ),
        },
        "metric_2_renewal_visibility": {
            "occupied_units": occupied_units,
            "occupied_with_term_end": occupied_with_term_end,
            "percent": term_end_pct,
            "definition": (
                "% of occupied units (tenant_contact set) with term_end populated"
            ),
        },
        "metric_2b_renewal_banner_views": {
            "event_name": RENEWAL_BANNER_EVENT,
            "views": banner_views,
            "distinct_landlords": banner_landlords,
            "distinct_units": banner_units,
            "definition": (
                f"product_events '{RENEWAL_BANNER_EVENT}' in trailing "
                f"{window_days} days (banner rendered on unit payments)"
            ),
        },
    }


def format_phase2_exit_report(report: dict[str, Any]) -> str:
    m1 = report["metric_1_non_rent_collection"]
    m2 = report["metric_2_renewal_visibility"]
    m2b = report["metric_2b_renewal_banner_views"]
    lines = [
        "Phase 2 exit check",
        f"  as_of: {report['as_of']}",
        f"  window: trailing {report['window_days']} days (from {report['window_start']})",
        "",
        "1. Non-rent collection",
        f"  {m1['percent']}%  "
        f"({m1['landlords_with_paid_non_rent']} / {m1['active_landlords']} active landlords)",
        f"  {m1['definition']}",
        "",
        "2. Renewal visibility (term_end populated)",
        f"  {m2['percent']}%  "
        f"({m2['occupied_with_term_end']} / {m2['occupied_units']} occupied units)",
        f"  {m2['definition']}",
        "",
        "2b. Renewal banner viewed",
        f"  views={m2b['views']}  landlords={m2b['distinct_landlords']}  "
        f"units={m2b['distinct_units']}",
        f"  {m2b['definition']}",
    ]
    return "\n".join(lines)
