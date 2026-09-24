"""Invite-only artisan roster + profile (Phase 5 F51)."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.invite_bind import require_invite_contact_match
from lib.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/artisans", tags=["artisans"])


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/roster")
def list_roster(user: AuthedUser = Depends(get_current_user)):
    ROSTER_PAGE_LIMIT = 100
    rows = (
        user.db.table("landlord_artisans")
        .select("*")
        .eq("landlord_id", user.id)
        .order("created_at", desc=True)
        .limit(ROSTER_PAGE_LIMIT)
        .execute()
        .data
        or []
    )
    return {
        "items": rows,
        "loaded": len(rows),
        "capped": len(rows) >= ROSTER_PAGE_LIMIT,
    }


@router.post("/invite", status_code=status.HTTP_201_CREATED)
def invite_artisan(payload: dict, user: AuthedUser = Depends(get_current_user)):
    contact = (payload.get("invite_contact") or "").strip()
    if not contact:
        raise HTTPException(status_code=400, detail="invite_contact is required")

    token = secrets.token_urlsafe(24)
    row = {
        "landlord_id": user.id,
        "invite_contact": contact[:120],
        "invite_token": token,
        "status": "invited",
        "invite_sent_at": _now(),
        "updated_at": _now(),
    }
    inserted = user.db.table("landlord_artisans").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create invite")

    notify: dict = {"sent": False, "channel": None, "error": None}
    try:
        from lib.delivery_outbox import enqueue_notification, flush_delivery_outbox
        from lib.email_templates import artisan_invite, frontend_base_url

        claim_url = f"{frontend_base_url()}/artisan/claim?token={token}"
        mail = artisan_invite(claim_url=claim_url)
        queued = enqueue_notification(
            user.db,
            idempotency_key=f"artisan-invite:{created.get('id') or token}",
            channel=None,
            contact=contact,
            message=mail.text,
            email_subject=mail.subject,
            email_html=mail.html,
        )
        flush_delivery_outbox(db=user.db, batch_size=5)
        notify = {
            "sent": True,
            "queued": True,
            "channel": queued.get("channel"),
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001 — invite must succeed even if notify fails
        notify["error"] = str(exc) or "notify_failed"

    # Claim URL is frontend-owned; return token for landlord to share.
    return {
        "item": created,
        "claim_path": f"/artisan/claim?token={token}",
        "notify": notify,
    }


@router.post("/claim")
def claim_invite(payload: dict, user: AuthedUser = Depends(get_current_user)):
    enforce_rate_limit(
        f"claim-artisan:{user.id}",
        limit=10,
        window_seconds=60,
        detail="Too many claim attempts. Try again shortly.",
    )
    token = (payload.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token is required")

    display_name = (payload.get("display_name") or "").strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name is required")

    trades_raw = payload.get("trades") or []
    if isinstance(trades_raw, str):
        trades = [t.strip() for t in trades_raw.split(",") if t.strip()]
    elif isinstance(trades_raw, list):
        trades = [str(t).strip() for t in trades_raw if str(t).strip()]
    else:
        trades = []

    phone = (payload.get("phone") or "").strip() or None
    svc = create_service_client()

    rows = (
        svc.table("landlord_artisans")
        .select("*")
        .eq("invite_token", token)
        .eq("status", "invited")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Invite not found or already claimed")

    invite = dict(rows[0])
    require_invite_contact_match(
        invite.get("invite_contact"),
        user.access_token,
        detail="Sign in with the phone or email this artisan invite was sent to.",
    )
    now = _now()

    # Upsert artisan profile
    existing_profile = (
        svc.table("artisan_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    profile_row = {
        "user_id": user.id,
        "display_name": display_name[:120],
        "trades": trades,
        "phone": phone,
        "status": "active",
        "updated_at": now,
    }
    if existing_profile:
        svc.table("artisan_profiles").update(profile_row).eq("user_id", user.id).execute()
    else:
        svc.table("artisan_profiles").insert(profile_row).execute()

    # Set role on profiles
    svc.table("profiles").update({"role": "artisan"}).eq("id", user.id).execute()

    updated = (
        svc.table("landlord_artisans")
        .update(
            {
                "artisan_user_id": user.id,
                "status": "active",
                "invite_token": None,
                "claimed_at": now,
                "updated_at": now,
            }
        )
        .eq("id", invite["id"])
        .execute()
        .data
    )
    membership = _first_row(updated) or {
        **invite,
        "artisan_user_id": user.id,
        "status": "active",
    }
    return {"item": membership, "profile": profile_row}


@router.get("/me")
def get_my_profile(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("artisan_profiles")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return {"profile": None}
    return {"profile": rows[0]}


@router.patch("/me")
def update_my_profile(payload: dict, user: AuthedUser = Depends(get_current_user)):
    patch: dict[str, Any] = {"updated_at": _now()}
    if "display_name" in payload:
        name = (payload.get("display_name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="display_name is required")
        patch["display_name"] = name[:120]
    if "phone" in payload:
        patch["phone"] = ((payload.get("phone") or "").strip() or None)
    if "trades" in payload:
        trades_raw = payload.get("trades") or []
        if isinstance(trades_raw, str):
            patch["trades"] = [t.strip() for t in trades_raw.split(",") if t.strip()]
        else:
            patch["trades"] = [str(t).strip() for t in trades_raw if str(t).strip()]
    if "status" in payload:
        st = (payload.get("status") or "").strip().lower()
        if st not in ("active", "paused"):
            raise HTTPException(status_code=400, detail="Invalid status")
        patch["status"] = st

    rows = (
        user.db.table("artisan_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Create profile via invite claim first")

    updated = (
        user.db.table("artisan_profiles")
        .update(patch)
        .eq("user_id", user.id)
        .execute()
        .data
    )
    return {"profile": _first_row(updated) or patch}
