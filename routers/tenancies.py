"""Phase 3 tenancy / checklist / docs / tenant invite API."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)

from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.invite_bind import require_invite_contact_match
from lib.rate_limit import client_ip, enforce_invite_limit, enforce_rate_limit
from lib.tenancy import (
    CHECKLIST_LABELS,
    OPTIONAL_IDENTITY_KEY,
    REQUIRED_CHECKLIST_KEYS,
    activation_blockers,
    can_activate_occupancy,
    required_checklist_complete,
)
from lib.tenancy_docs import (
    MAX_DOCUMENT_BYTES,
    SIGNED_URL_SECONDS,
    collection_capabilities,
    default_retain_until,
    delete_document_object,
    docs_read_enabled,
    docs_requests_enabled,
    docs_upload_enabled,
    document_acknowledgment_version,
    document_capabilities,
    scan_document,
    signed_document_url,
    upload_tenancy_document,
    validate_document,
)
from lib.tenancy_docs_notify import notify_tenancy_document_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenancies", tags=["tenancies"])

# Identity documents are never collected through the general upload.
GENERAL_DOC_TYPES = frozenset({"agreement", "reference", "other"})
REQUEST_DOC_TYPES = frozenset({"agreement", "reference"})
OPEN_REQUEST_STATUSES = ("open", "submitted", "changes_requested")
COLLECTION_TENANT_STATUSES = frozenset({"draft", "pending_verification"})
REVIEW_DECISIONS = frozenset({"accepted", "changes_requested"})
REVIEW_REASON_CODES = frozenset(
    {"incorrect_document", "incomplete", "illegible", "expired", "other"}
)
DOCS_OFF_MESSAGE = (
    "Tenancy documents are awaiting legal and privacy approval. Documents "
    "belong to the landlord; Nexora stores them for this tenancy."
)
DOCS_ON_MESSAGE = (
    "Documents belong to the landlord; Nexora stores them for this tenancy "
    "(landlord = controller, KTI = processor)."
)
DELETE_REFUSED = (
    "This document cannot be deleted yet: it is on legal hold, tied to an open "
    "request or active tenancy, or still inside its retention period."
)

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


@router.get("/")
def list_portfolio_tenancies(user: AuthedUser = Depends(get_current_user)):
    """First-class tenancies/tenants list for landlord nav."""
    TENANCIES_PAGE_LIMIT = 200
    rows = (
        user.db.table("tenancies")
        .select(
            "id, unit_id, status, tenant_name, tenant_contact, tenant_user_id, "
            "term_end, start_date, activated_at, created_at, "
            "units(label, property_id, properties(name))"
        )
        .eq("landlord_id", user.id)
        .order("created_at", desc=True)
        .limit(TENANCIES_PAGE_LIMIT)
        .execute()
        .data
        or []
    )
    items = []
    for row in rows:
        item = dict(row)
        unit = item.pop("units", None) or {}
        prop = unit.get("properties") if isinstance(unit, dict) else None
        item["unit_label"] = unit.get("label") if isinstance(unit, dict) else None
        item["property_name"] = prop.get("name") if isinstance(prop, dict) else None
        item["property_id"] = unit.get("property_id") if isinstance(unit, dict) else None
        items.append(item)
    return {
        "items": items,
        "loaded": len(items),
        "capped": len(items) >= TENANCIES_PAGE_LIMIT,
    }


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
    if existing:
        # Idempotent: handshake retries should invite the open row, not 409.
        return {"tenancy": _serialize(dict(existing[0]))}

    props = unit.get("properties")
    if isinstance(props, list):
        props = props[0] if props else {}
    if not isinstance(props, dict):
        props = {}
    landlord_id = (props.get("owner_id") or user.id)

    start = payload.get("start_date") or date.today().isoformat()
    term_end = payload.get("term_end") or unit.get("term_end")
    row = {
        "unit_id": unit_id,
        "landlord_id": landlord_id,
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
        # Some PostgREST configs omit RETURNING; re-read after insert.
        refreshed = (
            user.db.table("tenancies")
            .select("*")
            .eq("unit_id", unit_id)
            .eq("landlord_id", landlord_id)
            .neq("status", "ended")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        tenancy = _first_row(refreshed)
    if not tenancy:
        # Last resort: service insert when user JWT insert is blocked/empty.
        svc = create_service_client()
        inserted_svc = svc.table("tenancies").insert(row).execute().data
        tenancy = _first_row(inserted_svc)
    if not tenancy:
        raise HTTPException(status_code=500, detail="Could not create tenancy")
    return {"tenancy": _serialize(dict(tenancy))}


@router.post("/claim")
def claim_tenancy(payload: dict, user: AuthedUser = Depends(get_current_user)):
    """Tenant claims invite after OTP login; sets tenant_user_id + profile role."""
    enforce_rate_limit(
        f"claim-tenancy:{user.id}",
        limit=10,
        window_seconds=60,
        detail="Too many claim attempts. Try again shortly.",
    )
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
    require_invite_contact_match(
        tenancy.get("tenant_contact"),
        user.access_token,
        detail="Sign in with the phone or email on this tenancy invite.",
    )
    if tenancy.get("tenant_user_id") and tenancy["tenant_user_id"] != user.id:
        raise HTTPException(status_code=409, detail="Invite already claimed")
    # Link, clear the token, and set the tenant role in one transaction.
    result = _first_row(
        svc.rpc(
            "claim_tenancy_invite",
            {"p_tenancy_id": str(tenancy["id"]), "p_token": token, "p_user_id": user.id},
        )
        .execute()
        .data
    ) or {}
    outcome = result.get("outcome")
    if outcome == "already_claimed":
        raise HTTPException(status_code=409, detail="Invite already claimed")
    if outcome != "claimed":
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"tenancy": _serialize(dict(result.get("tenancy") or tenancy))}


@router.get("/me/current")
def my_tenancy(user: AuthedUser = Depends(get_current_user)):
    """Tenant: linked tenancy — prefer active, else latest claimed (pending activate)."""
    svc = create_service_client()
    select = (
        "*, units(id, label, rent_amount, service_charge_amount, properties(name))"
    )
    active = (
        svc.table("tenancies")
        .select(select)
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .order("activated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if active:
        return {"tenancy": _serialize(dict(active[0]))}

    linked = (
        svc.table("tenancies")
        .select(select)
        .eq("tenant_user_id", user.id)
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not linked:
        return {"tenancy": None}
    return {"tenancy": _serialize(dict(linked[0]))}


@router.patch("/me/autopay")
def update_my_autopay(payload: dict, user: AuthedUser = Depends(get_current_user)):
    """Tenant: enable/disable autopay with a saved card on the active tenancy."""
    svc = create_service_client()
    rows = (
        svc.table("tenancies")
        .select("*")
        .eq("tenant_user_id", user.id)
        .eq("status", "active")
        .order("activated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active occupancy required for autopay",
        )
    tenancy = dict(rows[0])
    enabled = bool(payload.get("enabled"))
    method_id = (payload.get("payment_method_id") or "").strip() or None
    try:
        days_before = int(payload.get("days_before", tenancy.get("autopay_days_before") or 0))
    except (TypeError, ValueError):
        days_before = 0
    days_before = max(0, min(7, days_before))

    updates: dict[str, Any] = {
        "autopay_enabled": enabled,
        "autopay_days_before": days_before,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    if enabled:
        if not method_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="payment_method_id is required to enable autopay",
            )
        cards = (
            svc.table("payment_methods")
            .select("id")
            .eq("id", method_id)
            .eq("user_id", user.id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not cards:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Saved card not found",
            )
        updates["autopay_payment_method_id"] = method_id
    else:
        updates["autopay_payment_method_id"] = None

    updated = (
        svc.table("tenancies")
        .update(updates)
        .eq("id", tenancy["id"])
        .eq("tenant_user_id", user.id)
        .execute()
        .data
        or []
    )
    row = _first_row(updated) or {**tenancy, **updates}
    # Re-fetch with unit join for client
    refreshed = (
        svc.table("tenancies")
        .select(
            "*, units(id, label, rent_amount, service_charge_amount, properties(name))"
        )
        .eq("id", tenancy["id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if refreshed:
        row = dict(refreshed[0])
    return {"tenancy": _serialize(dict(row))}


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
    if docs_requests_enabled():
        unresolved = (
            create_service_client()
            .table("tenancy_document_requests")
            .select("id")
            .eq("tenancy_id", tenancy_id)
            .in_("status", list(OPEN_REQUEST_STATUSES))
            .limit(1)
            .execute()
            .data
            or []
        )
        if unresolved:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Resolve requested documents before starting occupancy",
                    "blockers": ["Requested documents"],
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


def issue_tenancy_claim(user: AuthedUser, tenancy_id: str, *, notify: bool = True) -> dict:
    """Mint a claim link. Payments sends it; application approve does not."""
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
    claim_path = f"/tenant/claim?token={token}"
    from lib.email_templates import frontend_base_url

    claim_url = f"{frontend_base_url()}{claim_path}"
    invite_sent = False
    invite_channel: str | None = None
    invite_error: str | None = None
    if not notify:
        return {
            "tenancy": _serialize(dict(row)),
            "invite_token": token,
            "claim_path": claim_path,
            "claim_url": claim_url,
            "invite_sent": False,
            "invite_channel": None,
            "invite_error": None,
        }
    try:
        from lib.delivery_outbox import enqueue_notification, flush_delivery_outbox
        from lib.email_templates import tenancy_invite
        from lib.notify import (
            get_owner_notification_channel,
            normalize_e164,
        )

        channel = get_owner_notification_channel(user.db, user.id) or "sms"
        notify_to = (
            contact
            if channel == "email"
            else normalize_e164(contact)
        )
        mail = tenancy_invite(claim_url=claim_url)
        queued = enqueue_notification(
            user.db,
            idempotency_key=f"tenancy-invite:{tenancy_id}:{token}",
            channel=channel,
            contact=notify_to,
            message=mail.text,
            email_subject=mail.subject,
            email_html=mail.html,
        )
        flush_delivery_outbox(db=user.db, batch_size=5)
        invite_channel = queued.get("channel") or channel
        invite_sent = True
    except Exception as exc:
        invite_error = str(exc) or "Could not send invite notification"
    return {
        "tenancy": _serialize(dict(row)),
        "invite_token": token,
        "claim_path": claim_path,
        "claim_url": claim_url,
        "invite_sent": invite_sent,
        "invite_channel": invite_channel,
        "invite_error": None if invite_sent else invite_error,
    }


@router.post("/{tenancy_id}/invite")
def invite_tenant(tenancy_id: str, user: AuthedUser = Depends(get_current_user)):
    enforce_invite_limit(user.id)
    return issue_tenancy_claim(user, tenancy_id)


# --- Tenancy documents ------------------------------------------------------


def _parse_expiry(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        day = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dates must be YYYY-MM-DD",
        ) from exc
    if day < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date cannot be in the past",
        )
    return day.isoformat()


def _idempotency_key(request: Any) -> str:
    key = (request.headers.get("idempotency-key") or "").strip()
    if not 8 <= len(key) <= 120:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header (8-120 characters) is required",
        )
    return key


def _rpc_row(data: Any) -> dict | None:
    row = _first_row(data)
    return row if row and row.get("id") else None


def _rpc_error(exc: Exception) -> HTTPException:
    """Workflow rule violations raised by the 029 RPCs are 409s; the rest is 503."""
    message = getattr(exc, "message", None)
    if getattr(exc, "code", None) == "P0001" and message:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(message))
    logger.exception("tenancy document RPC failed")
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Document service is unavailable. Try again shortly.",
    )


def _load_tenancy_row(tenancy_id: str) -> dict:
    rows = (
        create_service_client()
        .table("tenancies")
        .select("*")
        .eq("id", tenancy_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenancy not found")
    return dict(rows[0])


def _load_tenancy_for_document_access(user: AuthedUser, tenancy_id: str) -> tuple[dict, str]:
    """Landlord at any status; linked tenant only during active occupancy."""
    tenancy = _load_tenancy_row(tenancy_id)
    if tenancy.get("landlord_id") == user.id:
        return tenancy, "landlord"
    if tenancy.get("tenant_user_id") == user.id:
        if tenancy.get("status") != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active occupancy is required to view tenancy documents",
            )
        return tenancy, "tenant"
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _load_tenancy_for_collection(user: AuthedUser, tenancy_id: str) -> tuple[dict, str]:
    """Requested documents are collected from a claimed tenant before occupancy."""
    tenancy = _load_tenancy_row(tenancy_id)
    if tenancy.get("landlord_id") == user.id:
        return tenancy, "landlord"
    if (
        tenancy.get("tenant_user_id") == user.id
        and tenancy.get("status") in COLLECTION_TENANT_STATUSES
    ):
        return tenancy, "tenant"
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _role_capabilities(role: str) -> dict[str, bool]:
    caps = document_capabilities()
    if role == "tenant":
        return {
            "read": caps["read"],
            "upload": False,
            "acknowledge": caps["acknowledge"],
            "delete": False,
        }
    return {
        "read": caps["read"],
        "upload": caps["upload"],
        "acknowledge": False,
        "delete": caps["delete"],
    }


def _load_document(svc: Any, tenancy_id: str, document_id: str, *, clean_only: bool) -> dict:
    rows = (
        svc.table("tenancy_documents")
        .select("*")
        .eq("id", document_id)
        .eq("tenancy_id", tenancy_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    document = dict(rows[0]) if rows else None
    if (
        not document
        or document.get("orphan_cleanup_pending")
        or (clean_only and document.get("scan_status") != "clean")
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return document


def _retention_elapsed(document: dict) -> bool:
    raw = document.get("retain_until")
    if not raw:
        return False
    try:
        retain_until = date.fromisoformat(str(raw)[:10])
    except ValueError:
        return False
    return retain_until <= datetime.now(timezone.utc).date()


def _can_delete_document(document: dict, tenancy: dict, capabilities: dict[str, bool]) -> bool:
    """Row-level subset of claim_tenancy_document_deletion; the RPC stays authoritative."""
    return (
        capabilities.get("delete", False)
        and tenancy.get("status") != "active"
        and not document.get("legal_hold")
        and _retention_elapsed(document)
    )


def _document_item(
    document: dict, acknowledgment: dict | None, *, can_delete: bool = False
) -> dict:
    ack = acknowledgment or {}
    return {
        "id": document.get("id"),
        "doc_type": document.get("doc_type"),
        "file_name": document.get("file_name"),
        "content_type": document.get("content_type"),
        "expires_on": document.get("expires_on"),
        "retain_until": document.get("retain_until"),
        "created_at": document.get("created_at"),
        "requires_ack": bool(document.get("requires_ack")),
        "scan_status": document.get("scan_status"),
        "legal_hold": bool(document.get("legal_hold")),
        "acknowledged_at": ack.get("acknowledged_at") or document.get("acknowledged_at"),
        "acknowledgment_text_version": ack.get("text_version"),
        # Links are minted per open so every view leaves an audit event.
        "url": None,
        "can_open": document.get("scan_status") == "clean",
        "can_delete": can_delete,
    }


def _record_document_event(
    svc: Any,
    *,
    document_id: str,
    tenancy_id: str,
    actor_id: str | None,
    event_type: str,
    metadata: dict | None = None,
) -> None:
    svc.table("tenancy_document_events").insert(
        {
            "document_id": document_id,
            "tenancy_id": tenancy_id,
            "actor_id": actor_id,
            "event_type": event_type,
            "metadata": metadata or {},
        }
    ).execute()


def _find_acknowledgment(svc: Any, document_id: str, actor_id: str) -> dict | None:
    rows = (
        svc.table("tenancy_document_acknowledgments")
        .select("*")
        .eq("document_id", document_id)
        .eq("actor_id", actor_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return dict(rows[0]) if rows else None


def _read_validated_upload(file: UploadFile) -> tuple[str, str, str, bytes]:
    try:
        body = file.file.read(MAX_DOCUMENT_BYTES + 1)
    finally:
        file.file.close()
    try:
        safe_name, content_type, checksum = validate_document(
            file_name=file.filename or "",
            content_type=file.content_type or "",
            file_bytes=body,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return safe_name, content_type, checksum, body


def _scan_and_store(
    *, tenancy_id: str, document_id: str, content_type: str, body: bytes, checksum: str
) -> str:
    """Scan before Storage so untrusted bytes never enter the bucket."""
    try:
        scan_document(body)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except RuntimeError as exc:
        logger.warning("tenancy document scan unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Document scanning is unavailable. Try again later.",
        ) from exc
    try:
        return upload_tenancy_document(
            tenancy_id=tenancy_id,
            document_id=document_id,
            content_type=content_type,
            file_bytes=body,
            sha256=checksum,
        )
    except Exception as exc:
        logger.exception("tenancy document storage upload failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not store the document. Try again.",
        ) from exc


def _discard_unreferenced_document(svc: Any, document_id: str, storage_path: str) -> None:
    """Remove an object and row nothing references yet; flag for retention if that fails."""
    try:
        delete_document_object(storage_path)
    except Exception:
        logger.exception("could not remove orphaned tenancy document %s", document_id)
        object_removed = False
    else:
        object_removed = True
    try:
        if object_removed:
            svc.table("tenancy_documents").delete().eq("id", document_id).execute()
            return
    except Exception:
        logger.exception("could not delete orphaned tenancy document row %s", document_id)
    try:
        svc.table("tenancy_documents").update({"orphan_cleanup_pending": True}).eq(
            "id", document_id
        ).execute()
    except Exception:
        logger.exception("could not flag orphaned tenancy document %s", document_id)


def _document_row(
    *,
    document_id: str,
    tenancy_id: str,
    landlord_id: str,
    doc_type: str,
    file_name: str,
    storage_path: str,
    content_type: str,
    checksum: str,
    uploaded_by: str,
    requires_ack: bool,
    expires_on: str | None,
    retain_until: str | None,
) -> dict:
    return {
        "id": document_id,
        "tenancy_id": tenancy_id,
        "landlord_id": landlord_id,
        "doc_type": doc_type,
        "file_name": file_name,
        "storage_path": storage_path,
        "content_type": content_type,
        "sha256": checksum,
        "uploaded_by": uploaded_by,
        "scan_status": "clean",
        "requires_ack": requires_ack,
        "expires_on": expires_on,
        "retain_until": retain_until,
        "legal_hold": False,
        "deleted_at": None,
    }


@router.get("/{tenancy_id}/documents")
def list_documents(tenancy_id: str, user: AuthedUser = Depends(get_current_user)):
    tenancy, role = _load_tenancy_for_document_access(user, tenancy_id)
    capabilities = _role_capabilities(role)
    if not capabilities["read"]:
        return {
            "docs_upload_enabled": False,
            "capabilities": capabilities,
            "items": [],
            "message": DOCS_OFF_MESSAGE,
        }
    svc = create_service_client()
    query = (
        svc.table("tenancy_documents")
        .select(
            "id, doc_type, file_name, content_type, expires_on, retain_until, "
            "created_at, requires_ack, acknowledged_at, scan_status, legal_hold, "
            "orphan_cleanup_pending"
        )
        .eq("tenancy_id", tenancy_id)
        .is_("deleted_at", "null")
    )
    if role == "tenant":
        query = query.eq("scan_status", "clean")
    documents = [
        doc
        for doc in query.order("created_at", desc=True).execute().data or []
        if not doc.get("orphan_cleanup_pending")
    ]

    acknowledgments: dict[str, dict] = {}
    document_ids = [str(doc.get("id")) for doc in documents]
    if document_ids:
        rows = (
            svc.table("tenancy_document_acknowledgments")
            .select("document_id, actor_id, acknowledged_at, text_version")
            .in_("document_id", document_ids)
        .execute()
        .data
        or []
    )
        for row in rows:
            if row.get("actor_id") == tenancy.get("tenant_user_id"):
                acknowledgments[str(row.get("document_id"))] = dict(row)
    return {
        "docs_upload_enabled": capabilities["upload"],
        "capabilities": capabilities,
        "items": [
            _document_item(
                dict(doc),
                acknowledgments.get(str(doc.get("id"))),
                can_delete=_can_delete_document(doc, tenancy, capabilities),
            )
            for doc in documents
        ],
        "message": DOCS_ON_MESSAGE,
    }


@router.post("/{tenancy_id}/documents")
def upload_document(
    tenancy_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    expires_on: str | None = Form(None),
    requires_ack: bool = Form(False),
    user: AuthedUser = Depends(get_current_user),
):
    tenancy = _load_tenancy_for_landlord(user, tenancy_id)
    if not docs_upload_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document upload is awaiting legal and privacy approval",
        )
    kind = (doc_type or "").strip().lower()
    if kind not in GENERAL_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doc_type must be agreement, reference, or other",
        )
    expiry = _parse_expiry(expires_on)
    enforce_rate_limit(
        f"tenancy-doc-upload:{user.id}",
        limit=30,
        window_seconds=3600,
        detail="Too many document uploads. Try again later.",
    )
    file_name, content_type, checksum, body = _read_validated_upload(file)
    document_id = str(uuid.uuid4())
    storage_path = _scan_and_store(
        tenancy_id=tenancy_id,
        document_id=document_id,
        content_type=content_type,
        body=body,
        checksum=checksum,
    )
    row = _document_row(
        document_id=document_id,
        tenancy_id=tenancy_id,
        landlord_id=tenancy.get("landlord_id") or user.id,
        doc_type=kind,
        file_name=file_name,
        storage_path=storage_path,
        content_type=content_type,
        checksum=checksum,
        uploaded_by=user.id,
        requires_ack=bool(requires_ack),
        expires_on=expiry,
        retain_until=default_retain_until().isoformat(),
    )
    svc = create_service_client()
    try:
        inserted = svc.table("tenancy_documents").insert(row).execute().data
        for event_type in ("uploaded", "scan_clean"):
            _record_document_event(
                svc,
                document_id=document_id,
                tenancy_id=tenancy_id,
                actor_id=user.id,
                event_type=event_type,
                metadata={"sha256": checksum} if event_type == "uploaded" else None,
            )
    except Exception as exc:
        logger.exception("tenancy document evidence write failed")
        _discard_unreferenced_document(svc, document_id, storage_path)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not save the document. Nothing was kept; try again.",
        ) from exc
    return {
        "document": _document_item(_first_row(inserted) or row, None),
        "tenancy_id": tenancy_id,
    }


@router.get("/{tenancy_id}/documents/{document_id}/open")
def open_document(
    tenancy_id: str,
    document_id: str,
    user: AuthedUser = Depends(get_current_user),
):
    _, role = _load_tenancy_for_document_access(user, tenancy_id)
    if not docs_read_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document reads are awaiting legal and privacy approval",
        )
    svc = create_service_client()
    document = _load_document(svc, tenancy_id, document_id, clean_only=True)
    storage_path = document.get("storage_path")
    if not storage_path or document.get("purged_at"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    try:
        _record_document_event(
            svc,
            document_id=document_id,
            tenancy_id=tenancy_id,
            actor_id=user.id,
            event_type="document_opened",
            metadata={"role": role},
        )
        url = signed_document_url(storage_path)
    except Exception as exc:
        logger.exception("could not open tenancy document %s", document_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not open the document. Try again shortly.",
        ) from exc
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not open the document. Try again shortly.",
        )
    return {"url": url, "expires_in": SIGNED_URL_SECONDS}


@router.post("/{tenancy_id}/documents/{document_id}/acknowledge")
def acknowledge_document(
    tenancy_id: str,
    document_id: str,
    request: Request,
    user: AuthedUser = Depends(get_current_user),
):
    """Receipt/read acknowledgment by the active tenant; not an electronic signature."""
    _, role = _load_tenancy_for_document_access(user, tenancy_id)
    if role != "tenant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the active tenant can acknowledge receipt",
        )
    text_version = document_acknowledgment_version()
    if not document_capabilities()["acknowledge"] or not text_version:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acknowledgment is awaiting approved receipt text",
        )
    svc = create_service_client()
    document = _load_document(svc, tenancy_id, document_id, clean_only=True)
    if not document.get("requires_ack"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document does not ask for acknowledgment",
        )
    existing = _find_acknowledgment(svc, document_id, user.id)
    if existing:
        return {"already": True, "acknowledgment": existing}

    ip_address = client_ip(request)
    user_agent = (request.headers.get("user-agent") or "").strip()[:400]
    row = {
        "document_id": document_id,
        "tenancy_id": tenancy_id,
        "actor_id": user.id,
        "text_version": text_version,
        "ip_address": None if ip_address == "unknown" else ip_address,
        "user_agent": user_agent or None,
    }
    try:
        inserted = svc.table("tenancy_document_acknowledgments").insert(row).execute().data
    except Exception as exc:
        # unique (document_id, actor_id): a concurrent request may have won.
        winner = _find_acknowledgment(svc, document_id, user.id)
        if winner:
            return {"already": True, "acknowledgment": winner}
        logger.exception("could not record tenancy document acknowledgment")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not record acknowledgment. Try again.",
        ) from exc
    return {"already": False, "acknowledgment": _first_row(inserted) or row}


@router.delete("/{tenancy_id}/documents/{document_id}")
def delete_document(
    tenancy_id: str,
    document_id: str,
    user: AuthedUser = Depends(get_current_user),
):
    _load_tenancy_for_landlord(user, tenancy_id)
    if not document_capabilities()["delete"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document deletion is awaiting legal and privacy approval",
        )
    svc = create_service_client()
    document = _load_document(svc, tenancy_id, document_id, clean_only=False)
    if document.get("legal_hold"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DELETE_REFUSED)

    now = datetime.now(timezone.utc).isoformat()
    uses_atomic_claim = hasattr(svc, "rpc")
    if uses_atomic_claim:
        try:
            claimed = _rpc_row(
                svc.rpc(
                    "claim_tenancy_document_deletion",
                    {
                        "p_document_id": document_id,
                        "p_landlord_id": user.id,
                        "p_deleted_at": now,
                    },
                )
                .execute()
                .data
            )
        except Exception as exc:
            raise _rpc_error(exc) from exc
    else:  # Lightweight local test doubles; production uses the locked RPC.
        claimed = _first_row(
        svc.table("tenancy_documents")
            .update({"deleted_at": now, "deleted_by": user.id})
        .eq("id", document_id)
        .eq("tenancy_id", tenancy_id)
            .eq("legal_hold", False)
            .is_("deleted_at", "null")
            .execute()
            .data
        )
        if claimed:
            _record_document_event(
                svc,
                document_id=document_id,
                tenancy_id=tenancy_id,
                actor_id=user.id,
                event_type="delete_started",
            )
    if not claimed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DELETE_REFUSED)

    try:
        delete_document_object(str(document.get("storage_path") or ""))
    except Exception as exc:
        logger.exception("tenancy document storage delete failed %s", document_id)
        try:
            _record_document_event(
                svc,
                document_id=document_id,
                tenancy_id=tenancy_id,
                actor_id=user.id,
                event_type="delete_failed",
                metadata={"error": str(exc)[:240]},
            )
        except Exception:
            logger.exception("could not record failed delete %s", document_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The document is hidden but its file could not be removed yet; it will be retried.",
        ) from exc

    try:
        if uses_atomic_claim:
            svc.rpc(
                "complete_tenancy_document_storage_operation",
                {
                    "p_document_id": document_id,
                    "p_operation": "delete",
                    "p_actor_id": user.id,
                },
            ).execute()
        else:
            _record_document_event(
                svc,
                document_id=document_id,
                tenancy_id=tenancy_id,
                actor_id=user.id,
                event_type="deleted",
            )
    except Exception:
        # deletion_evidence_pending stays set; the retention job reconciles it.
        logger.exception("tenancy document delete evidence pending %s", document_id)
    return {"ok": True}


# --- Requested document collection (029 RPCs) -------------------------------


@router.post("/{tenancy_id}/document-requests")
def create_document_request(
    tenancy_id: str,
    request: Request,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    _, role = _load_tenancy_for_collection(user, tenancy_id)
    if not collection_capabilities(role)["request"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document requests are awaiting legal and privacy approval",
        )
    key = _idempotency_key(request)
    doc_type = (payload.get("doc_type") or "").strip().lower()
    if doc_type not in REQUEST_DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doc_type must be agreement or reference",
        )
    policy_version = (payload.get("processing_policy_version") or "").strip()
    if not policy_version:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="processing_policy_version is required",
        )
    title = (payload.get("title") or "").strip()
    if not 1 <= len(title) <= 120:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="title is required (120 characters max)",
        )
    instructions = (payload.get("instructions") or "").strip() or None
    if instructions and len(instructions) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="instructions must be 500 characters or fewer",
        )
    due_on = _parse_expiry(payload.get("due_on"))

    svc = create_service_client()
    try:
        item = _rpc_row(
            svc.rpc(
                "create_tenancy_document_request",
                {
                    "p_tenancy_id": tenancy_id,
                    "p_landlord_id": user.id,
                    "p_doc_type": doc_type,
                    "p_processing_policy_version": policy_version,
                    "p_title": title,
                    "p_instructions": instructions,
                    "p_due_on": due_on,
                    "p_idempotency_key": key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise _rpc_error(exc) from exc
    if not item:
        raise _rpc_error(RuntimeError("create_tenancy_document_request returned no row"))
    notification = notify_tenancy_document_event(
        svc,
        tenancy_id=tenancy_id,
        recipient="tenant",
        message=f"Your landlord asked for a document on Nexora: {title}. Open your tenant portal to send it.",
        email_subject="Your landlord asked for a document",
        idempotency_key=f"doc-request:{item['id']}",
    )
    return {"item": item, "notification": notification}


@router.post("/{tenancy_id}/document-requests/{request_id}/submissions")
def submit_requested_document(
    tenancy_id: str,
    request_id: str,
    request: Request,
    file: UploadFile = File(...),
    notice_version: str = Form(...),
    replaces_submission_id: str | None = Form(None),
    user: AuthedUser = Depends(get_current_user),
):
    _, role = _load_tenancy_for_collection(user, tenancy_id)
    if not collection_capabilities(role)["submit_requested"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requested document uploads are awaiting legal and privacy approval",
        )
    key = _idempotency_key(request)
    notice = (notice_version or "").strip()
    if not notice:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="notice_version is required",
        )
    replaces = (replaces_submission_id or "").strip() or None

    svc = create_service_client()
    # A retry lands after the request moved to "submitted", so replay before the status check.
    prior = (
        svc.table("tenancy_document_submissions")
        .select("*")
        .eq("submitted_by", user.id)
        .eq("idempotency_key", key)
        .limit(1)
        .execute()
        .data
        or []
    )
    if prior:
        if str(prior[0].get("request_id")) != request_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This Idempotency-Key was already used for another request",
            )
        return {"already": True, "submission": dict(prior[0])}
    requests = (
        svc.table("tenancy_document_requests")
        .select("*")
        .eq("id", request_id)
        .eq("tenancy_id", tenancy_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not requests:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document request not found")
    doc_request = dict(requests[0])
    if doc_request.get("status") not in {"open", "changes_requested"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This request is not accepting documents",
        )
    policies = (
        svc.table("tenancy_document_processing_policies")
        .select("version, privacy_notice_version")
        .eq("version", doc_request.get("processing_policy_version"))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not policies or policies[0].get("privacy_notice_version") != notice:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The privacy notice changed. Reload and review it before sending.",
        )
    enforce_rate_limit(
        f"tenancy-doc-submit:{user.id}",
        limit=30,
        window_seconds=3600,
        detail="Too many document uploads. Try again later.",
    )
    file_name, content_type, checksum, body = _read_validated_upload(file)
    document_id = str(uuid.uuid4())
    storage_path = _scan_and_store(
        tenancy_id=tenancy_id,
        document_id=document_id,
        content_type=content_type,
        body=body,
        checksum=checksum,
    )
    row = _document_row(
        document_id=document_id,
        tenancy_id=tenancy_id,
        landlord_id=doc_request.get("landlord_id"),
        doc_type=doc_request.get("doc_type"),
        file_name=file_name,
        storage_path=storage_path,
        content_type=content_type,
        checksum=checksum,
        uploaded_by=user.id,
        requires_ack=False,
        expires_on=None,
        # Retention is anchored by the request's processing policy.
        retain_until=None,
    )
    try:
        svc.table("tenancy_documents").insert(row).execute()
    except Exception as exc:
        logger.exception("requested tenancy document row write failed")
        _discard_unreferenced_document(svc, document_id, storage_path)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not save the document. Nothing was kept; try again.",
        ) from exc
    try:
        submission = _rpc_row(
            svc.rpc(
                "create_tenancy_document_submission",
                {
                    "p_request_id": request_id,
                    "p_document_id": document_id,
                    "p_actor_id": user.id,
                    "p_notice_version": notice,
                    "p_notice_presented_at": datetime.now(timezone.utc).isoformat(),
                    "p_replaces_submission_id": replaces,
                    "p_idempotency_key": key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        _discard_unreferenced_document(svc, document_id, storage_path)
        raise _rpc_error(exc) from exc
    if not submission:
        _discard_unreferenced_document(svc, document_id, storage_path)
        raise _rpc_error(RuntimeError("create_tenancy_document_submission returned no row"))
    if str(submission.get("document_id")) != document_id:
        # Same Idempotency-Key already submitted another upload; keep the winner only.
        _discard_unreferenced_document(svc, document_id, storage_path)
        return {"already": True, "submission": submission}
    notification = notify_tenancy_document_event(
        svc,
        tenancy_id=tenancy_id,
        recipient="landlord",
        message=f"Your tenant sent the document you asked for: {doc_request.get('title') or 'document'}. Review it on Nexora.",
        email_subject="Your tenant sent a requested document",
        idempotency_key=f"doc-submission:{submission['id']}",
    )
    return {"already": False, "submission": submission, "notification": notification}


@router.post("/{tenancy_id}/documents/{document_id}/decision")
def decide_requested_document(
    tenancy_id: str,
    document_id: str,
    request: Request,
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    _, role = _load_tenancy_for_collection(user, tenancy_id)
    if not collection_capabilities(role)["review"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document review is awaiting legal and privacy approval",
        )
    key = _idempotency_key(request)
    decision = (payload.get("decision") or "").strip()
    if decision not in REVIEW_DECISIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="decision must be accepted or changes_requested",
        )
    reason_code = (payload.get("reason_code") or "").strip() or None
    if decision == "changes_requested" and reason_code not in REVIEW_REASON_CODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason_code is required when asking for changes",
        )
    if decision == "accepted":
        reason_code = None
    comment = (payload.get("comment") or "").strip() or None
    if comment and len(comment) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="comment must be 500 characters or fewer",
        )

    svc = create_service_client()
    submissions = (
        svc.table("tenancy_document_submissions")
        .select("id, request_id, document_id")
        .eq("document_id", document_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    submission = dict(submissions[0]) if submissions else None
    requests = []
    if submission:
        requests = (
            svc.table("tenancy_document_requests")
            .select("id, tenancy_id, landlord_id")
            .eq("id", submission.get("request_id"))
            .eq("tenancy_id", tenancy_id)
            .limit(1)
            .execute()
            .data
            or []
        )
    if not submission or not requests:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    try:
        decided = _rpc_row(
            svc.rpc(
                "decide_tenancy_document_submission",
                {
                    "p_request_id": submission["request_id"],
                    "p_submission_id": submission["id"],
                    "p_landlord_id": user.id,
                    "p_decision": decision,
                    "p_reason_code": reason_code,
                    "p_comment": comment,
                    "p_idempotency_key": key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise _rpc_error(exc) from exc
    if not decided:
        raise _rpc_error(RuntimeError("decide_tenancy_document_submission returned no row"))
    message = (
        "Your landlord accepted the document you sent."
        if decision == "accepted"
        else "Your landlord asked for changes to the document you sent. Open your tenant portal to send a new one."
    )
    notification = notify_tenancy_document_event(
        svc,
        tenancy_id=tenancy_id,
        recipient="tenant",
        message=message,
        email_subject="Update on the document you sent",
        idempotency_key=f"doc-decision:{decided['id']}:{decision}",
    )
    return {"submission": decided, "notification": notification}
