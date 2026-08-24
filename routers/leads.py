import logging
import os
from typing import Literal
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from lib.auth import AuthedUser, require_admin
from lib.brand import BRAND_NAME
from lib.db import create_service_client
from lib.notify import send_notification
from lib.pagination import apply_desc_cursor, page_size, paginate_desc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])

LeadStatus = Literal["new", "contacted", "invited", "closed"]


class LeadStatusUpdate(BaseModel):
    status: LeadStatus = Field(..., description="Triage status for this access request")


def _frontend_base() -> str:
    return (
        os.getenv("FRONTEND_URL")
        or os.getenv("CORS_ORIGINS", "").split(",")[0]
        or "http://localhost:3000"
    ).strip().rstrip("/")


def _admin_db(user: AuthedUser):
    """Prefer service client so ADMIN_EMAILS work under leads RLS."""
    try:
        return create_service_client()
    except RuntimeError:
        return user.db


@router.get("/")
def list_leads(
    user: AuthedUser = Depends(require_admin),
    cursor: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=50),
):
    db = _admin_db(user)
    size = page_size(limit)
    query = (
        db.table("leads")
        .select("*")
        .order("created_at", desc=True)
        .order("id", desc=True)
    )
    query = apply_desc_cursor(query, cursor)
    rows = query.limit(size + 1).execute().data or []
    items, next_cursor = paginate_desc(rows, size)
    return {"items": items, "next_cursor": next_cursor}


@router.patch("/{lead_id}")
def update_lead_status(
    lead_id: str,
    body: LeadStatusUpdate,
    user: AuthedUser = Depends(require_admin),
):
    db = _admin_db(user)
    result = (
        db.table("leads")
        .update({"status": body.status})
        .eq("id", lead_id)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )
    return rows[0]


@router.post("/{lead_id}/invite")
def invite_lead(lead_id: str, user: AuthedUser = Depends(require_admin)):
    """
    Mark lead invited, send signup link via SMS (fallback WhatsApp), return URL.
    """
    db = _admin_db(user)
    rows = db.table("leads").select("*").eq("id", lead_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )
    lead = rows[0]
    name = (lead.get("name") or "").strip() or "there"
    whatsapp = (lead.get("whatsapp") or "").strip()
    params = {
        "invite": lead_id,
        "name": name if name != "there" else "",
        "whatsapp": whatsapp,
    }
    query = urlencode({k: v for k, v in params.items() if v}, quote_via=quote)
    invite_url = f"{_frontend_base()}/signup?{query}"

    message = (
        f"Hi {name}, you're invited to {BRAND_NAME}. "
        f"Create your landlord account: {invite_url}"
    )

    invite_sent = False
    invite_channel: str | None = None
    invite_error: str | None = None

    if whatsapp:
        # Prefer SMS for NG delivery; fall back to WhatsApp if SMS fails.
        for channel in ("sms", "whatsapp"):
            try:
                invite_channel = send_notification(channel, whatsapp, message)
                invite_sent = True
                break
            except Exception as exc:
                invite_error = str(exc)
                logger.warning(
                    "Invite %s via %s failed for lead %s: %s",
                    channel,
                    channel,
                    lead_id,
                    exc,
                )
    else:
        invite_error = "Lead has no WhatsApp/phone number"

    updated = (
        db.table("leads")
        .update({"status": "invited"})
        .eq("id", lead_id)
        .execute()
        .data
        or []
    )
    return {
        "invite_url": invite_url,
        "invite_sent": invite_sent,
        "invite_channel": invite_channel,
        "invite_error": None if invite_sent else invite_error,
        "lead": updated[0] if updated else {**lead, "status": "invited"},
    }
