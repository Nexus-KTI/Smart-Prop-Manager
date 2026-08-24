"""Phase 3 tenancy / checklist / docs / tenant invite API."""

from __future__ import annotations

import base64
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.tenancy import (
    CHECKLIST_LABELS,
    OPTIONAL_IDENTITY_KEY,
    REQUIRED_CHECKLIST_KEYS,
    activation_blockers,
    can_activate_occupancy,
    required_checklist_complete,
)
from lib.tenancy_docs import (
    default_retain_until,
    docs_upload_enabled,
    signed_document_url,
    upload_tenancy_document,
)

router = APIRouter(prefix="/tenancies", tags=["tenancies"])

VALID_DOC_TYPES = frozenset({"id", "agreement", "reference", "other"})

# Prefer Dojah for NIN/BVN (cleaner NG identity APIs); VerifyMe also viable.
# No live partner call yet — landlord can mark optional identity done manually.
IDENTITY_PROVIDER_NOTE = (
    "Optional NIN/BVN: prefer Dojah for a cleaner Nigeria identity API; "
    "VerifyMe is the alternative. Full criminal/credit screening is out of scope."
)


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data:
        row = data[0]
        return row if isinstance(row, dict) else None
    if isinstance(data, dict):
        return data
    return None


def _require_owned_unit(user: AuthedUser, unit_id: str) -> dict:
    rows = (
        user.db.table("units")
        .select("id, label, tenant_name, tenant_contact, term_end, property_id, properties!inner(owner_id, name)")
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


def _load_tenancy_for_landlord(user: AuthedUser, tenancy_id: str) -> dict:
    rows = (
        user.db.table("tenancies")
        .select("*")
        .eq("id", tenancy_id)
        .eq("landlord_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenancy not found")
    return dict(rows[0])


def _checklist_payload(tenancy: dict) -> list[dict]:
    items = []
    for key in REQUIRED_CHECKLIST_KEYS:
        items.append(
            {
                "key": key,
                "label": CHECKLIST_LABELS[key],
                "done": bool(tenancy.get(key)),
                "required": True,
            }
        )
    items.append(
        {
            "key": OPTIONAL_IDENTITY_KEY,
            "label": CHECKLIST_LABELS[OPTIONAL_IDENTITY_KEY],
            "done": bool(tenancy.get(OPTIONAL_IDENTITY_KEY)),
            "required": False,
            "note": IDENTITY_PROVIDER_NOTE,
        }
    )
    return items


def _serialize(tenancy: dict) -> dict:
    return {
        **tenancy,
        "required_checklist_complete": required_checklist_complete(tenancy),
        "can_activate": can_activate_occupancy(tenancy),
        "activation_blockers": activation_blockers(tenancy),
        "checklist": _checklist_payload(tenancy),
        "docs_upload_enabled": docs_upload_enabled(),
        "docs_belong_to_landlord": (
            "Documents belong to the landlord; Nexora stores them for this "
            "tenancy record (landlord = controller, KTI = processor)."
        ),
    }


@router.get("/docs-flag")
def docs_flag(user: AuthedUser = Depends(get_current_user)):
    return {"docs_upload_enabled": docs_upload_enabled()}


@router.get("/unit/{unit_id}")
def get_or_list_tenancy(unit_id: str, user: AuthedUser = Depends(get_current_user)):
    _require_owned_unit(user, unit_id)
    rows = (
        user.db.table("tenancies")
        .select("*")
        .eq("unit_id", unit_id)
        .eq("landlord_id", user.id)
        .neq("status", "ended")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return {"tenancy": None}
    return {"tenancy": _serialize(dict(rows[0]))}


@router.post("/unit/{unit_id}")
def create_tenancy(unit_id: str, payload: dict, user: AuthedUser = Depends(get_current_user)):
    unit = _require_owned_unit(user, unit_id)
    existing = (
        user.db.table("tenancies")
        .select("id")
        .eq("unit_id", unit_id)
        .neq("status", "ended")
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An open tenancy already exists for this unit",
        )

    start = payload.get("start_date") or date.today().isoformat()
    term_end = payload.get("term_end") or unit.get("term_end")
    row = {
        "unit_id": unit_id,
        "landlord_id": user.id,
        "tenant_name": (payload.get("tenant_name") or unit.get("tenant_name") or "").strip()
        or None,
        "tenant_contact": (
            payload.get("tenant_contact") or unit.get("tenant_contact") or ""
        ).strip()
        or None,
        "start_date": start,
        "term_end": term_end,
        "status": "pending_verification",
    }
    inserted = user.db.table("tenancies").insert(row).execute().data
    tenancy = _first_row(inserted)
    if not tenancy:
        raise HTTPException(status_code=500, detail="Could not create tenancy")
    return {"tenancy": _serialize(dict(tenancy))}


@router.post("/claim")
def claim_tenancy(payload: dict, user: AuthedUser = Depends(get_current_user)):
    """Tenant claims invite after OTP login; sets tenant_user_id + profile role."""
    token = (payload.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token is required")
    svc = create_service_client()
    rows = (
        svc.table("tenancies")
        .select("*")
        .eq("invite_token", token)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Invite not found")
    tenancy = dict(rows[0])
    if tenancy.get("tenant_user_id") and tenancy["tenant_user_id"] != user.id:
        raise HTTPException(status_code=409, detail="Invite already claimed")
    now = datetime.now(timezone.utc).isoformat()
    svc.table("tenancies").update(
        {
            "tenant_user_id": user.id,
            "updated_at": now,
            "invite_token": None,
        }
    ).eq("id", tenancy["id"]).execute()
    svc.table("profiles").upsert(
        {"id": user.id, "role": "tenant"},
        on_conflict="id",
    ).execute()
    refreshed = (
        svc.table("tenancies").select("*").eq("id", tenancy["id"]).limit(1).execute().data
        or []
    )
    return {"tenancy": _serialize(dict(refreshed[0] if refreshed else tenancy))}


@router.get("/me/current")
def my_tenancy(user: AuthedUser = Depends(get_current_user)):
    """Tenant: active tenancy linked to this user."""
    svc = create_service_client()
    rows = (
        svc.table("tenancies")
        .select(
            "*, units(id, label, rent_amount, service_charge_amount, properties(name))"
        )
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .order("activated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return {"tenancy": None}
    return {"tenancy": _serialize(dict(rows[0]))}


@router.get("/{tenancy_id}")
def get_tenancy(tenancy_id: str, user: AuthedUser = Depends(get_current_user)):
    return {"tenancy": _serialize(_load_tenancy_for_landlord(user, tenancy_id))}


@router.patch("/{tenancy_id}/checklist")
def update_checklist(tenancy_id: str, payload: dict, user: AuthedUser = Depends(get_current_user)):
    tenancy = _load_tenancy_for_landlord(user, tenancy_id)
    updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    allowed = set(REQUIRED_CHECKLIST_KEYS) | {OPTIONAL_IDENTITY_KEY}
    for key in allowed:
        if key in payload:
            updates[key] = bool(payload[key])
    if OPTIONAL_IDENTITY_KEY in updates and updates[OPTIONAL_IDENTITY_KEY]:
        updates["identity_provider"] = (
            payload.get("identity_provider") or tenancy.get("identity_provider") or "manual"
        )
    updated = (
        user.db.table("tenancies")
        .update(updates)
        .eq("id", tenancy_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated) or {**tenancy, **updates}
    return {"tenancy": _serialize(dict(row))}


@router.post("/{tenancy_id}/activate")
def activate_tenancy(tenancy_id: str, user: AuthedUser = Depends(get_current_user)):
    tenancy = _load_tenancy_for_landlord(user, tenancy_id)
    if tenancy.get("status") == "active":
        return {"tenancy": _serialize(tenancy)}
    if not can_activate_occupancy(tenancy):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Required checklist incomplete",
                "blockers": activation_blockers(tenancy),
            },
        )
    now = datetime.now(timezone.utc).isoformat()
    updated = (
        user.db.table("tenancies")
        .update(
            {
                "status": "active",
                "activated_at": now,
                "updated_at": now,
            }
        )
        .eq("id", tenancy_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated)
    # Sync light occupancy fields onto unit (Phase 1/2 conventions).
    if row:
        unit_patch: dict[str, Any] = {}
        if row.get("tenant_name"):
            unit_patch["tenant_name"] = row["tenant_name"]
        if row.get("tenant_contact"):
            unit_patch["tenant_contact"] = row["tenant_contact"]
        if row.get("term_end"):
            unit_patch["term_end"] = row["term_end"]
        if unit_patch:
            user.db.table("units").update(unit_patch).eq("id", row["unit_id"]).execute()
        svc = create_service_client()
        svc.table("product_events").insert(
            {
                "event_name": "tenancy_activated",
                "landlord_id": user.id,
                "unit_id": row.get("unit_id"),
                "metadata": {
                    "tenancy_id": tenancy_id,
                    "required_checklist_complete": True,
                    "identity_verified": bool(row.get("checklist_identity_verified")),
                },
            }
        ).execute()
    return {"tenancy": _serialize(dict(row or tenancy))}


@router.post("/{tenancy_id}/invite")
def invite_tenant(tenancy_id: str, user: AuthedUser = Depends(get_current_user)):
    tenancy = _load_tenancy_for_landlord(user, tenancy_id)
    contact = (tenancy.get("tenant_contact") or "").strip()
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="tenant_contact is required before invite",
        )
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc).isoformat()
    updated = (
        user.db.table("tenancies")
        .update({"invite_token": token, "invite_sent_at": now, "updated_at": now})
        .eq("id", tenancy_id)
        .execute()
        .data
    )
    row = _first_row(updated) or tenancy
    # Soft notify: reuse landlord channel toward tenant contact when possible.
    try:
        from lib.notify import get_owner_notification_channel, send_notification

        channel = get_owner_notification_channel(user.db, user.id) or "sms"
        send_notification(
            channel,
            contact,
            (
                f"You're invited to view rent and pay on Nexora. "
                f"Sign in with this phone/email, then open /tenant/claim?token={token}"
            ),
        )
    except Exception:
        pass
    return {
        "tenancy": _serialize(dict(row)),
        "invite_token": token,
        "claim_path": f"/tenant/claim?token={token}",
    }


@router.get("/{tenancy_id}/documents")
def list_documents(tenancy_id: str, user: AuthedUser = Depends(get_current_user)):    # Landlord or linked tenant
    svc = create_service_client()
    tenancy_rows = (
        svc.table("tenancies").select("*").eq("id", tenancy_id).limit(1).execute().data
        or []
    )
    if not tenancy_rows:
        raise HTTPException(status_code=404, detail="Tenancy not found")
    tenancy = dict(tenancy_rows[0])
    if tenancy["landlord_id"] != user.id and tenancy.get("tenant_user_id") != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not docs_upload_enabled():
        return {
            "docs_upload_enabled": False,
            "items": [],
            "message": (
                "Document upload is off until landlord ToS/DPA is in place. "
                "Documents belong to the landlord; Nexora stores them for the tenancy."
            ),
        }
    docs = (
        svc.table("tenancy_documents")
        .select("id, doc_type, file_name, expires_on, retain_until, created_at, storage_path")
        .eq("tenancy_id", tenancy_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    items = []
    for doc in docs:
        item = dict(doc)
        path = item.pop("storage_path", None)
        item["url"] = signed_document_url(path) if path else None
        items.append(item)
    return {
        "docs_upload_enabled": True,
        "items": items,
        "message": (
            "Documents belong to the landlord; Nexora stores them for this tenancy "
            "(landlord = controller, KTI = processor)."
        ),
    }


@router.post("/{tenancy_id}/documents")
def upload_document(tenancy_id: str, payload: dict, user: AuthedUser = Depends(get_current_user)):
    if not docs_upload_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document upload is disabled (NEXT_PUBLIC_DOCS_UPLOAD_ENABLED)",
        )
    tenancy = _load_tenancy_for_landlord(user, tenancy_id)
    doc_type = (payload.get("doc_type") or "").strip().lower()
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(status_code=400, detail="Invalid doc_type")
    file_name = (payload.get("file_name") or "document.pdf").strip()
    content_type = (payload.get("content_type") or "application/pdf").strip()
    b64 = payload.get("content_base64") or ""
    try:
        file_bytes = base64.b64decode(b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid content_base64") from exc
    if len(file_bytes) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 8MB)")

    doc_id = str(uuid.uuid4())
    expires_on = payload.get("expires_on")
    retain_until = default_retain_until()
    path = upload_tenancy_document(
        tenancy_id=tenancy_id,
        document_id=doc_id,
        file_name=file_name,
        content_type=content_type,
        file_bytes=file_bytes,
    )
    row = {
        "id": doc_id,
        "tenancy_id": tenancy_id,
        "landlord_id": user.id,
        "doc_type": doc_type,
        "file_name": file_name,
        "storage_path": path,
        "content_type": content_type,
        "expires_on": expires_on,
        "retain_until": retain_until.isoformat(),
    }
    inserted = user.db.table("tenancy_documents").insert(row).execute().data
    return {"document": _first_row(inserted) or row, "tenancy_id": tenancy["id"]}
