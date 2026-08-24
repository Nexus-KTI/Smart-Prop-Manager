"""Phase 4 exit-criteria metrics."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def compute_phase4_exit(db: Any, *, now: datetime | None = None) -> dict[str, Any]:
    """
    Exit bar (PRD §9 / §14):
      1. At least one Manager operating ≥2 owner portfolios with grants active.
      2. Staff leverage: units under management per active Caretaker/PM user.
    """
    moment = now or datetime.now(timezone.utc)

    memberships = (
        db.table("staff_memberships")
        .select("id, owner_id, user_id, role, status")
        .eq("status", "active")
        .execute()
        .data
        or []
    )

    # Managers with ≥2 distinct owner portfolios
    manager_owners: dict[str, set[str]] = {}
    active_staff_users: set[str] = set()
    for row in memberships:
        uid = row.get("user_id")
        if not uid:
            continue
        uid = str(uid)
        active_staff_users.add(uid)
        if row.get("role") == "manager":
            manager_owners.setdefault(uid, set()).add(str(row["owner_id"]))

    multi_portfolio_managers = [
        uid for uid, owners in manager_owners.items() if len(owners) >= 2
    ]
    exit_bar_met = len(multi_portfolio_managers) >= 1

    # Units under management for active staff (union of scoped properties' units)
    # Approximate: all units on properties owned by any owner they have a grant for,
    # when scope_all; for scoped grants we'd need membership_properties — use service
    # joins if available on fake db tests with simple tables.
    owner_ids = {str(r["owner_id"]) for r in memberships if r.get("owner_id")}
    unit_rows = (
        db.table("units")
        .select("id, property_id, properties!inner(owner_id)")
        .execute()
        .data
        or []
    )
    units_under_staff = 0
    for u in unit_rows:
        prop = u.get("properties") or {}
        if isinstance(prop, list):
            prop = prop[0] if prop else {}
        oid = str(prop.get("owner_id") or "")
        if oid in owner_ids:
            units_under_staff += 1

    staff_count = len(active_staff_users)
    leverage = (
        round(units_under_staff / staff_count, 2) if staff_count else 0.0
    )

    return {
        "as_of": moment.isoformat(),
        "metric_1_multi_portfolio_manager": {
            "managers_with_ge_2_portfolios": len(multi_portfolio_managers),
            "manager_user_ids": multi_portfolio_managers,
            "exit_bar_met": exit_bar_met,
            "definition": (
                "At least one Manager/PM user operates >=2 owner portfolios "
                "with active memberships (permission boundaries enforced in API)."
            ),
        },
        "metric_2_staff_leverage": {
            "active_staff_users": staff_count,
            "units_under_management": units_under_staff,
            "units_per_staff": leverage,
            "definition": (
                "Units under management per active Caretaker/PM user (PRD section 14)."
            ),
        },
        "active_memberships": len(memberships),
    }


def format_phase4_exit_report(report: dict[str, Any]) -> str:
    m1 = report["metric_1_multi_portfolio_manager"]
    m2 = report["metric_2_staff_leverage"]
    lines = [
        "Phase 4 exit check",
        f"  as_of: {report['as_of']}",
        "",
        "1. Manager across >=2 owner portfolios",
        f"  exit_bar_met: {m1['exit_bar_met']}",
        f"  managers_with_ge_2_portfolios: {m1['managers_with_ge_2_portfolios']}",
        f"  {m1['definition']}",
        "",
        "2. Staff leverage (units per active staff)",
        f"  {m2['units_per_staff']} units/staff  "
        f"({m2['units_under_management']} units / {m2['active_staff_users']} staff)",
        f"  {m2['definition']}",
        "",
        f"active_memberships: {report['active_memberships']}",
    ]
    return "\n".join(lines)
