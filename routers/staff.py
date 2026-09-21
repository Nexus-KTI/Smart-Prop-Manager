"""Phase 4 staff invite / claim / team / portfolios / audit / ops."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from lib.access import (
    PERM_CHASE,
    PERM_TEAM_INVITE,
    accessible_property_ids_for_portfolio,
    defaults_for_role,
    portfolios_for_user,
    resolve_portfolio,
)
from lib.audit import list_audit_for_owner, record_audit
from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.invite_bind import require_invite_contact_match
from lib.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/staff", tags=["staff"])


def _first(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _portfolio_owner_header(
    x_portfolio_owner_id: str | None = Header(
        default=None, alias="X-Portfolio-Owner-Id"
    ),
    owner_id: str | None = Query(default=None),
) -> str | None:
    return (owner_id or x_portfolio_owner_id or "").strip() or None


def _serialize_membership(row: dict) -> dict:
    token = row.get("invite_token")
    return {
        **row,
        "claim_path": f"/staff/claim?token={token}" if token else None,
    }


@router.get("/portfolios")
def list_portfolios(user: AuthedUser = Depends(get_current_user)):
    """Owned + granted owner portfolios for the signed-in user (F41 switcher)."""
    items = portfolios_for_user(user.id)
    svc = create_service_client()
    for item in items:
        oid = item["owner_id"]
        prof = (
            svc.table("profiles")
            .select("business_name")
            .eq("id", oid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if prof and (prof[0].get("business_name") or "").strip():
            item["owner_label"] = (prof[0].get("business_name") or "").strip()
        else:
            item["owner_label"] = (
                "Your portfolio" if item.get("is_self") else "Owner"
            )
    return {"items": items}


@router.get("/me")
def staff_me(
    user: AuthedUser = Depends(get_current_user),
    portfolio_owner_id: str | None = Depends(_portfolio_owner_header),
):
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    return {
        "user_id": user.id,
        "active_owner_id": ctx.owner_id,
        "role": ctx.role,
        "membership_id": ctx.membership_id,
        "permissions": sorted(ctx.permissions) if ctx.role != "owner" else ["*"],
        "portfolios": portfolios_for_user(user.id),
    }


@router.get("/team")
def list_team(
    user: AuthedUser = Depends(get_current_user),
    portfolio_owner_id: str | None = Depends(_portfolio_owner_header),
):
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    if ctx.role == "caretaker":
        raise HTTPException(
            status_code=403, detail="Team view requires Owner or Manager"
        )
    if ctx.role == "manager":
        ctx.require(PERM_TEAM_INVITE)

    owner_id = user.id if ctx.role == "owner" else ctx.owner_id
    rows = (
        create_service_client()
        .table("staff_memberships")
        .select("*")
        .eq("owner_id", owner_id)
        .neq("status", "revoked")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return {
        "owner_id": owner_id,
        "items": [_serialize_membership(dict(r)) for r in rows],
    }


@router.post("/invite")
def invite_staff(
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
    portfolio_owner_id: str | None = Depends(_portfolio_owner_header),
):
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    if ctx.role == "owner":
        owner_id = user.id
    elif ctx.role == "manager":
        ctx.require(PERM_TEAM_INVITE)
        owner_id = ctx.owner_id
    else:
        raise HTTPException(status_code=403, detail="Cannot invite staff")

    role = (payload.get("role") or "").strip().lower()
    if role not in ("manager", "caretaker"):
        raise HTTPException(status_code=400, detail="role must be manager or caretaker")
    if ctx.role == "manager" and role != "caretaker":
        raise HTTPException(
            status_code=403, detail="Managers may only invite Caretakers"
        )

    contact = (payload.get("contact") or payload.get("invite_contact") or "").strip()
    if not contact:
        raise HTTPException(status_code=400, detail="contact is required")

    defaults = defaults_for_role(role)
    flags = {
        "can_money": bool(payload.get("can_money", defaults["money"])),
        "can_money_log_cash": bool(
            payload.get("can_money_log_cash", defaults["money_log_cash"])
        ),
        "can_chase": bool(payload.get("can_chase", defaults["chase"])),
        "can_docs_view": bool(payload.get("can_docs_view", defaults["docs_view"])),
        "can_docs_upload": bool(
            payload.get("can_docs_upload", defaults["docs_upload"])
        ),
        "can_access_visitor_passes": bool(
            payload.get(
                "can_access_visitor_passes", defaults["access_visitor_passes"]
            )
        ),
        "can_team_invite": bool(
            payload.get("can_team_invite", defaults["team_invite"])
        ),
    }
    if role == "caretaker":
        flags["can_money"] = False
        flags["can_team_invite"] = False

    property_ids = [str(p) for p in (payload.get("property_ids") or []) if p]
    scope_all = len(property_ids) == 0
    svc = create_service_client()

    if property_ids:
        owned = {
            str(r["id"])
            for r in (
                svc.table("properties")
                .select("id")
                .eq("owner_id", owner_id)
                .execute()
                .data
                or []
            )
        }
        for pid in property_ids:
            if pid not in owned:
                raise HTTPException(
                    status_code=400, detail="Invalid property_id in scope"
                )

    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "owner_id": owner_id,
        "role": role,
        "status": "invited",
        "invite_token": token,
        "invite_contact": contact,
        "invite_sent_at": now,
        "scope_all_properties": scope_all,
        "updated_at": now,
        **flags,
    }
    inserted = svc.table("staff_memberships").insert(row).execute().data
    membership = _first(inserted)
    if not membership:
        raise HTTPException(status_code=500, detail="Could not create invite")

    if property_ids and membership.get("id"):
        links = [
            {"membership_id": membership["id"], "property_id": pid}
            for pid in property_ids
        ]
        svc.table("staff_membership_properties").insert(links).execute()

    notify: dict = {"sent": False, "channel": None, "error": None}
    try:
        from lib.delivery_outbox import enqueue_notification, flush_delivery_outbox
        from lib.email_templates import frontend_base_url

        claim_url = f"{frontend_base_url()}/staff/claim?token={token}"
        queued = enqueue_notification(
            svc,
            idempotency_key=f"staff-invite:{membership.get('id') or token}",
            channel=None,
            contact=contact,
            message=(
                f"You've been invited as {role} on Nexora. "
                f"Sign in, then open {claim_url}"
            ),
            email_subject="Nexora staff invite",
        )
        flush_delivery_outbox(db=svc, batch_size=5)
        notify = {
            "sent": True,
            "queued": True,
            "channel": queued.get("channel"),
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001 — invite must succeed even if notify fails
        notify["error"] = str(exc) or "notify_failed"

    record_audit(
        ctx,
        action="staff.invite",
        target_type="staff_membership",
        target_id=str(membership["id"]),
        metadata={"role": role, "contact": contact},
    )

    return {
        "membership": _serialize_membership(dict(membership)),
        "invite_token": token,
        "claim_path": f"/staff/claim?token={token}",
        "notify": notify,
    }


@router.post("/claim")
def claim_staff_invite(payload: dict, user: AuthedUser = Depends(get_current_user)):
    enforce_rate_limit(
        f"claim-staff:{user.id}",
        limit=10,
        window_seconds=60,
        detail="Too many claim attempts. Try again shortly.",
    )
    token = (payload.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token is required")
    svc = create_service_client()
    rows = (
        svc.table("staff_memberships")
        .select("*")
        .eq("invite_token", token)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Invite not found")
    membership = dict(rows[0])
    require_invite_contact_match(
        membership.get("invite_contact"),
        user.access_token,
        detail="Sign in with the phone or email this staff invite was sent to.",
    )
    if membership.get("status") == "revoked":
        raise HTTPException(status_code=410, detail="Invite revoked")
    if membership.get("user_id") and membership["user_id"] != user.id:
        raise HTTPException(status_code=409, detail="Invite already claimed")
    if str(membership.get("owner_id")) == user.id:
        raise HTTPException(status_code=400, detail="Cannot claim your own invite")

    now = datetime.now(timezone.utc).isoformat()
    updated = (
        svc.table("staff_memberships")
        .update(
            {
                "user_id": user.id,
                "status": "active",
                "invite_token": None,
                "claimed_at": now,
                "updated_at": now,
            }
        )
        .eq("id", membership["id"])
        .execute()
        .data
    )
    row = _first(updated) or {**membership, "user_id": user.id, "status": "active"}
    return {"membership": _serialize_membership(dict(row))}


@router.post("/{membership_id}/revoke")
def revoke_membership(
    membership_id: str,
    user: AuthedUser = Depends(get_current_user),
):
    svc = create_service_client()
    rows = (
        svc.table("staff_memberships")
        .select("*")
        .eq("id", membership_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Membership not found")
    membership = dict(rows[0])
    owner_id = str(membership["owner_id"])
    if user.id == owner_id:
        ctx = resolve_portfolio(user.id, owner_id)
    else:
        ctx = resolve_portfolio(user.id, owner_id)
        ctx.require(PERM_TEAM_INVITE)
        if membership.get("role") == "manager":
            raise HTTPException(status_code=403, detail="Cannot revoke a Manager")

    now = datetime.now(timezone.utc).isoformat()
    svc.table("staff_memberships").update(
        {"status": "revoked", "invite_token": None, "updated_at": now}
    ).eq("id", membership_id).execute()
    record_audit(
        ctx,
        action="staff.revoke",
        target_type="staff_membership",
        target_id=membership_id,
    )
    return {"ok": True, "id": membership_id}


@router.get("/audit")
def owner_audit_log(
    user: AuthedUser = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
):
    items = list_audit_for_owner(user.id, limit=limit)
    return {"items": items}


@router.get("/ops/overdue")
def portfolio_overdue_ops(
    user: AuthedUser = Depends(get_current_user),
    portfolio_owner_id: str | None = Depends(_portfolio_owner_header),
):
    ctx = resolve_portfolio(user.id, portfolio_owner_id)
    ctx.require(PERM_CHASE)

    property_ids = accessible_property_ids_for_portfolio(ctx)
    if not property_ids:
        return {
            "items": [],
            "owner_id": ctx.owner_id,
            "role": ctx.role,
            "loaded": 0,
            "capped": False,
        }

    OPS_UNIT_CAP = 200
    svc = create_service_client()
    rows = (
        svc.table("units")
        .select(
            "id, label, rent_amount, service_charge_amount, frequency, due_day, "
            "due_month, term_end, tenant_name, tenant_contact, property_id, "
            "properties!inner(id, name, owner_id), "
            "transactions(status, amount, paid_at, created_at, charge_type)"
        )
        .in_("property_id", property_ids)
        .eq("properties.owner_id", ctx.owner_id)
        .order("created_at", desc=True)
        .limit(OPS_UNIT_CAP)
        .execute()
        .data
        or []
    )

    items = []
    for row in rows:
        unit = dict(row)
        prop = unit.pop("properties", None) or {}
        if isinstance(prop, list):
            prop = prop[0] if prop else {}
        txns = unit.get("transactions") or []
        items.append(
            {
                "unit": unit,
                "property_id": prop.get("id") or unit.get("property_id"),
                "property_name": prop.get("name") or "",
                "owner_id": ctx.owner_id,
                "transactions": txns,
            }
        )
    return {
        "items": items,
        "owner_id": ctx.owner_id,
        "role": ctx.role,
        "permissions": sorted(ctx.permissions),
        "loaded": len(items),
        "capped": len(items) >= OPS_UNIT_CAP,
    }


@router.post("/access/visitor-pass")
def visitor_pass_deprecated(user: AuthedUser = Depends(get_current_user)):
    """Deprecated stub — real passes live under Access."""
    del user
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Visitor passes live at POST /access/passes. This staff stub is retired.",
    )
