"""Rental applications + tenant→landlord connect."""

from __future__ import annotations

import os
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.rate_limit import client_ip, enforce_rate_limit

router = APIRouter(prefix="/applications", tags=["applications"])

VALID_DECIDE = frozenset({"approved", "rejected", "closed"})

APPLY_QUESTIONS = (
    {"key": "move_in", "label": "Preferred move-in"},
    {"key": "occupation", "label": "What you do (job / business)"},
    {"key": "guarantor_name", "label": "Guarantor name"},
    {"key": "guarantor_phone", "label": "Guarantor phone"},
)
ANSWER_MAX = 120
ANSWER_LABELS = {q["key"]: q["label"] for q in APPLY_QUESTIONS}


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


def normalize_screening_answers(raw: Any) -> dict[str, str]:
    """Keep known Lagos-lite keys; cap length. Unknown keys dropped."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Invalid screening_answers")
    out: dict[str, str] = {}
    for key in ANSWER_LABELS:
        value = str(raw.get(key) or "").strip()
        if not value:
            continue
        out[key] = value[:ANSWER_MAX]
    return out


def flatten_application(row: dict) -> dict:
    """Promote units/properties embeds to unit_label and property_name."""
    out = dict(row)
    unit = out.pop("units", None) or {}
    prop = out.pop("properties", None) or {}
    if isinstance(unit, list):
        unit = unit[0] if unit else {}
    if isinstance(prop, list):
        prop = prop[0] if prop else {}
    if isinstance(unit, dict):
        out["unit_label"] = unit.get("label")
        if unit.get("rent_amount") is not None:
            out["rent_amount"] = unit.get("rent_amount")
    if isinstance(prop, dict):
        out["property_name"] = prop.get("name")
        if prop.get("address"):
            out["property_address"] = prop.get("address")
    return out


def apply_preview_payload(row: dict, token: str) -> dict:
    """Public apply page fields. Photo and note come from the unit embed."""
    unit = row.get("units") or {}
    if isinstance(unit, list):
        unit = unit[0] if unit else {}
    if not isinstance(unit, dict):
        unit = {}
    flat = flatten_application(dict(row))
    photo = (unit.get("photo_url") or "").strip() or None
    note = (unit.get("apply_note") or "").strip() or None
    return {
        "token": token,
        "status": row.get("status"),
        "unit_label": flat.get("unit_label"),
        "property_name": flat.get("property_name"),
        "property_address": flat.get("property_address"),
        "rent_amount": flat.get("rent_amount"),
        "photo_url": photo,
        "apply_note": note,
        "questions": [dict(q) for q in APPLY_QUESTIONS],
    }


def _frontend_base() -> str:
    return (
        os.getenv("FRONTEND_URL")
        or (os.getenv("CORS_ORIGINS") or "").split(",")[0]
        or "http://localhost:3000"
    ).strip().rstrip("/")


def _require_owned_unit(user: AuthedUser, unit_id: str) -> dict:
    rows = (
        user.db.table("units")
        .select("id, property_id, label, properties!inner(owner_id, name)")
        .eq("id", unit_id)
        .eq("properties.owner_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unit not found")
    return dict(rows[0])


APPLICATIONS_PAGE_LIMIT = 100
PENDING_DECISION_STATUSES = ("submitted",)


def _exact_count(db, table: str, *, eq_filters: dict, in_filters: dict | None = None) -> int:
    q = db.table(table).select("id", count="exact")
    for key, value in eq_filters.items():
        q = q.eq(key, value)
    if in_filters:
        for key, values in in_filters.items():
            q = q.in_(key, list(values))
    res = q.limit(1).execute()
    return int(getattr(res, "count", None) or 0)


@router.get("/")
def list_applications(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("rental_applications")
        .select("*, units(label), properties(name)")
        .eq("landlord_id", user.id)
        .order("created_at", desc=True)
        .limit(APPLICATIONS_PAGE_LIMIT)
        .execute()
        .data
        or []
    )
    rows = [flatten_application(dict(r)) for r in rows]
    pending_count = _exact_count(
        user.db,
        "rental_applications",
        eq_filters={"landlord_id": user.id},
        in_filters={"status": PENDING_DECISION_STATUSES},
    )
    return {
        "items": rows,
        "pending_count": pending_count,
        "loaded": len(rows),
        "capped": len(rows) >= APPLICATIONS_PAGE_LIMIT,
    }


@router.get("/pending-count")
def applications_pending_count(user: AuthedUser = Depends(get_current_user)):
    pending_count = _exact_count(
        user.db,
        "rental_applications",
        eq_filters={"landlord_id": user.id},
        in_filters={"status": PENDING_DECISION_STATUSES},
    )
    return {"pending_count": pending_count}


@router.post("/unit/{unit_id}", status_code=status.HTTP_201_CREATED)
def open_application_invite(unit_id: str, user: AuthedUser = Depends(get_current_user)):
    unit = _require_owned_unit(user, unit_id)
    token = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "landlord_id": user.id,
        "property_id": unit["property_id"],
        "unit_id": unit_id,
        "invite_token": token,
        "status": "open",
        "updated_at": now,
    }
    inserted = user.db.table("rental_applications").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not create application invite")
    path = f"/apply/{token}"
    return {
        "item": created,
        "apply_path": path,
        "apply_url": f"{_frontend_base()}{path}",
    }


@router.get("/token/{token}")
def preview_application(token: str, request: Request):
    """Public preview for apply page (service role)."""
    enforce_rate_limit(
        f"app-preview:ip:{client_ip(request)}",
        limit=30,
        window_seconds=60,
        detail="Too many invite lookups. Try again shortly.",
    )
    try:
        svc = create_service_client()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Service unavailable") from exc
    rows = (
        svc.table("rental_applications")
        .select(
            "id, status, unit_id, property_id, invite_token, "
            "units(label, rent_amount, photo_url, apply_note), properties(name, address)"
        )
        .eq("invite_token", token)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Application invite not found")
    row = dict(rows[0])
    if row.get("status") not in ("open", "submitted"):
        raise HTTPException(status_code=400, detail="This application is no longer open")
    return apply_preview_payload(row, token)


@router.post("/token/{token}/submit", status_code=status.HTTP_201_CREATED)
def submit_application(token: str, payload: dict, user: AuthedUser = Depends(get_current_user)):
    name = (payload.get("applicant_name") or "").strip()
    email = (payload.get("applicant_email") or user.email or "").strip()
    phone = (payload.get("applicant_phone") or "").strip() or None
    notes = (payload.get("notes") or "").strip() or None
    answers = normalize_screening_answers(payload.get("screening_answers") or {})
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    try:
        svc = create_service_client()
    except RuntimeError:
        svc = user.db

    rows = (
        svc.table("rental_applications")
        .select("*, units(label), properties(name)")
        .eq("invite_token", token)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Application invite not found")
    current = dict(rows[0])
    if current.get("status") != "open":
        raise HTTPException(status_code=400, detail="Application is not open for submission")

    now = datetime.now(timezone.utc).isoformat()
    updated = (
        svc.table("rental_applications")
        .update(
            {
                "status": "submitted",
                "applicant_name": name[:120],
                "applicant_email": email[:200],
                "applicant_phone": (phone or "")[:40] or None,
                "applicant_user_id": user.id,
                "notes": (notes or "")[:2000] or None,
                "screening_answers": answers,
                "updated_at": now,
            }
        )
        .eq("id", current["id"])
        .eq("status", "open")
        .execute()
        .data
    )
    row = _first_row(updated) or {**current, "status": "submitted"}
    try:
        from lib.application_notify import notify_application_submitted

        place = flatten_application(
            {
                "units": current.get("units"),
                "properties": current.get("properties"),
            }
        )
        notify_application_submitted(
            svc,
            landlord_id=str(current.get("landlord_id") or ""),
            application_id=str(row.get("id") or current.get("id")),
            applicant_name=name,
            property_name=place.get("property_name"),
            unit_label=place.get("unit_label"),
        )
    except Exception:
        pass
    return {"item": row}


@router.post("/connect-landlord", status_code=status.HTTP_201_CREATED)
def connect_landlord(payload: dict, user: AuthedUser = Depends(get_current_user)):
    email = (payload.get("landlord_email") or "").strip().lower()
    name = (payload.get("landlord_name") or "").strip() or None
    message = (payload.get("message") or "").strip() or None
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid landlord_email is required")

    row = {
        "tenant_user_id": user.id,
        "landlord_email": email[:200],
        "landlord_name": (name or "")[:120] or None,
        "message": (message or "")[:1000] or None,
        "status": "pending",
    }
    inserted = user.db.table("landlord_connect_requests").insert(row).execute().data
    created = _first_row(inserted) or row

    signup = f"{_frontend_base()}/signup?role=landlord"
    try:
        from lib.delivery_outbox import enqueue_notification, flush_delivery_outbox

        enqueue_notification(
            user.db,
            idempotency_key=f"connect-landlord:{created.get('id') or email}",
            channel="email",
            contact=email,
            message=(
                f"{name or 'A tenant'} asked you to manage their rent on Nexora.\n\n"
                f"{message or ''}\n\n"
                f"Create a landlord account: {signup}\n"
            ),
            email_subject="Your tenant invited you to Nexora",
        )
        flush_delivery_outbox(db=user.db, batch_size=5)
        if created.get("id"):
            user.db.table("landlord_connect_requests").update({"status": "sent"}).eq(
                "id", created["id"]
            ).execute()
            created["status"] = "sent"
    except Exception:
        pass

    return {"item": created}


@router.patch("/{application_id}")
def decide_application(
    application_id: str,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    next_status = (payload.get("status") or "").strip().lower()
    if next_status not in VALID_DECIDE:
        raise HTTPException(status_code=400, detail="Invalid status")

    rows = (
        user.db.table("rental_applications")
        .select("*, units(label), properties(name)")
        .eq("id", application_id)
        .eq("landlord_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Application not found")
    current = dict(rows[0])
    if current.get("status") not in ("open", "submitted"):
        raise HTTPException(status_code=400, detail="Application already decided")

    now = datetime.now(timezone.utc).isoformat()
    patch = {
        "status": next_status,
        "updated_at": now,
        "decided_at": now if next_status in ("approved", "rejected") else None,
    }
    updated = (
        user.db.table("rental_applications")
        .update(patch)
        .eq("id", application_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated) or {**current, **patch}

    tenancy_id = None
    # On approve: reuse an open tenancy or create a draft.
    if next_status == "approved":
        existing = (
            user.db.table("tenancies")
            .select("id")
            .eq("unit_id", current["unit_id"])
            .in_("status", ["draft", "pending_verification", "active"])
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            tenancy_id = existing[0].get("id")
        else:
            contact = current.get("applicant_phone") or current.get("applicant_email")
            inserted = (
                user.db.table("tenancies")
                .insert(
                    {
                        "unit_id": current["unit_id"],
                        "landlord_id": user.id,
                        "tenant_user_id": current.get("applicant_user_id"),
                        "status": "draft",
                        "tenant_name": current.get("applicant_name"),
                        "tenant_contact": contact,
                    }
                )
                .execute()
                .data
            )
            created_tenancy = _first_row(inserted)
            if created_tenancy:
                tenancy_id = created_tenancy.get("id")

    claim_path = None
    claim_url = None
    if next_status == "approved" and tenancy_id:
        try:
            from routers.tenancies import invite_tenant

            invited = invite_tenant(str(tenancy_id), user)
            claim_path = invited.get("claim_path")
            claim_url = invited.get("claim_url")
        except Exception:
            pass

    if next_status in ("approved", "rejected"):
        try:
            from lib.application_notify import notify_application_decided

            place = flatten_application(dict(current))
            notify_application_decided(
                user.db,
                application_id=str(current.get("id") or application_id),
                status=next_status,
                applicant_email=current.get("applicant_email"),
                applicant_phone=current.get("applicant_phone"),
                property_name=place.get("property_name"),
                unit_label=place.get("unit_label"),
                next_url=claim_url if next_status == "approved" else None,
            )
        except Exception:
            pass

    return {
        "item": row,
        "unit_id": current.get("unit_id"),
        "tenancy_id": tenancy_id,
        "claim_path": claim_path,
        "claim_url": claim_url,
    }
