"""Public (unauthenticated) lead capture + invite validation."""

from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from lib.captcha import captcha_enforced, verify_turnstile
from lib.db import create_service_client
from lib.rate_limit import client_ip, enforce_rate_limit

router = APIRouter(prefix="/public", tags=["public"])

LeadSource = Literal["access", "callback"]

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)


class PublicLeadCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    whatsapp: str = Field(..., min_length=7, max_length=32)
    unit_count: int | None = Field(default=None, ge=1, le=100_000)
    source: LeadSource = "access"
    captcha_token: str | None = None


class InviteValidateResponse(BaseModel):
    valid: bool
    name: str | None = None
    whatsapp: str | None = None


def _service_db():
    try:
        return create_service_client()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Lead service unavailable.",
        ) from exc


@router.post("/leads")
def create_public_lead(body: PublicLeadCreate, request: Request):
    """Marketing access / callback capture — rate limited + optional Turnstile."""
    ip = client_ip(request)
    enforce_rate_limit(
        f"public-lead:{ip}",
        limit=8,
        window_seconds=60,
        detail="Too many requests. Try again in a minute.",
    )
    verify_turnstile(body.captcha_token, remoteip=ip)

    name = body.name.strip()
    whatsapp = body.whatsapp.strip()
    if len(name) < 2 or len(whatsapp) < 7:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name and WhatsApp number are required.",
        )
    if body.source == "access" and body.unit_count is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Number of properties is required.",
        )

    db = _service_db()
    row = {
        "name": name,
        "whatsapp": whatsapp,
        "unit_count": body.unit_count,
        "source": body.source,
        "status": "new",
    }
    result = db.table("leads").insert(row).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save your request.",
        )
    return {"ok": True, "id": rows[0].get("id")}


@router.get("/invites/{invite_id}", response_model=InviteValidateResponse)
def validate_signup_invite(invite_id: str, request: Request):
    """
    Confirm a landlord beta invite (?invite=<lead uuid>) is real and invited.
    Rate limited; does not reveal whether an id exists unless status=invited.
    """
    ip = client_ip(request)
    enforce_rate_limit(
        f"public-invite:{ip}",
        limit=30,
        window_seconds=60,
        detail="Too many invite checks. Try again shortly.",
    )

    raw = (invite_id or "").strip()
    if not _UUID_RE.match(raw):
        return InviteValidateResponse(valid=False)

    try:
        UUID(raw)
    except ValueError:
        return InviteValidateResponse(valid=False)

    db = _service_db()
    rows = (
        db.table("leads")
        .select("id,name,whatsapp,status")
        .eq("id", raw)
        .eq("status", "invited")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return InviteValidateResponse(valid=False)

    lead = rows[0]
    name = (lead.get("name") or "").strip() or None
    whatsapp = (lead.get("whatsapp") or "").strip() or None
    return InviteValidateResponse(valid=True, name=name, whatsapp=whatsapp)


@router.get("/captcha-required")
def public_captcha_required():
    """Let the web client know whether lead forms must collect Turnstile."""
    return {"required": captcha_enforced()}
