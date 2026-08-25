"""Current-user profile endpoints backed by public.profiles (+ auth contact fields)."""

from __future__ import annotations

import os
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from supabase_auth.errors import AuthApiError

from lib.auth import AuthedUser, get_current_user, verify_access_token
from lib.db import create_service_client

router = APIRouter(prefix="/users", tags=["users"])

_supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
_supabase_anon_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY") or ""

NotificationChannel = Literal["whatsapp", "sms", "email"]
SignupRole = Literal["landlord", "tenant", "artisan"]
SignupPersona = Literal[
    "manage_own",
    "manage_others",
    "manage_mix",
    "none_yet",
    "broker",
]
SignupYears = Literal["less_1", "1_4", "5_10", "more_10", "none_yet"]


class UserProfileUpdate(BaseModel):
    name: str | None = Field(default=None, description="Display name (auth metadata)")
    business_name: str | None = Field(
        default=None,
        description="Optional agency/business name shown on receipts and reminders",
    )
    email: str | None = Field(default=None, description="Optional email address")
    notification_channel: NotificationChannel | None = Field(
        default=None,
        description="Preferred notification channel",
    )
    role: SignupRole | None = Field(
        default=None,
        description="Account role chosen at signup (landlord, tenant, or artisan)",
    )
    signup_persona: SignupPersona | None = Field(
        default=None,
        description="Landlord qualify: who they manage for",
    )
    signup_unit_count: int | None = Field(
        default=None,
        ge=0,
        description="Self-reported units owned/managed at signup",
    )
    signup_years: SignupYears | None = Field(
        default=None,
        description="Self-reported years managing rentals",
    )


def _format_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = str(phone).strip()
    if not digits:
        return None
    return digits if digits.startswith("+") else f"+{digits}"


def _fetch_auth_user(access_token: str):
    try:
        response = verify_access_token(access_token)
    except AuthApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    if response.user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return response.user


def _ensure_profile_row(user: AuthedUser) -> dict[str, Any]:
    """Return the caller's profiles row, creating it under RLS if missing."""
    result = (
        user.db.table("profiles")
        .select("*")
        .eq("id", user.id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if rows:
        return rows[0]

    inserted = (
        user.db.table("profiles")
        .insert(
            {
                "id": user.id,
                "business_name": None,
                "notification_channel": "sms",
            }
        )
        .execute()
    )
    created = inserted.data or []
    if created:
        return created[0]

    # Race: another request created the row
    again = (
        user.db.table("profiles")
        .select("*")
        .eq("id", user.id)
        .limit(1)
        .execute()
    )
    again_rows = again.data or []
    if again_rows:
        return again_rows[0]

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not load profile",
    )


def _serialize(auth_user: Any, profile: dict[str, Any]) -> dict[str, Any]:
    meta = auth_user.user_metadata or {}
    if not isinstance(meta, dict):
        meta = {}
    name = str(meta.get("full_name") or meta.get("name") or "").strip()
    role = str(profile.get("role") or "landlord").strip() or "landlord"
    return {
        "id": auth_user.id,
        "name": name,
        "business_name": profile.get("business_name"),
        "notification_channel": profile.get("notification_channel") or "sms",
        "role": role,
        "signup_persona": profile.get("signup_persona"),
        "signup_unit_count": profile.get("signup_unit_count"),
        "signup_years": profile.get("signup_years"),
        "phone": _format_phone(getattr(auth_user, "phone", None)),
        "email": getattr(auth_user, "email", None),
        "avatar_url": profile.get("avatar_url") or None,
        "created_at": profile.get("created_at"),
    }


def _update_auth_user(access_token: str, user_id: str, attributes: dict[str, Any]):
    """Update auth.users via the caller's JWT, with service-role fallback."""
    if not _supabase_url or not _supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase is not configured",
        )

    url = f"{_supabase_url}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "apikey": _supabase_anon_key,
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.put(url, headers=headers, json=attributes)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach auth service",
        ) from exc

    if response.status_code < 400:
        return response.json()

    try:
        admin = create_service_client()
        admin_attrs: dict[str, Any] = {}
        if "email" in attributes:
            admin_attrs["email"] = attributes["email"]
        if "data" in attributes:
            admin_attrs["user_metadata"] = attributes["data"]
        result = admin.auth.admin.update_user_by_id(user_id, admin_attrs)
        if result.user is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Profile update failed",
            )
        return result.user
    except RuntimeError:
        detail = "Could not update profile"
        try:
            body = response.json()
            if isinstance(body, dict):
                detail = str(
                    body.get("msg") or body.get("error_description") or detail
                )
        except Exception:
            detail = response.text or detail
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        ) from None
    except AuthApiError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get("/me")
def get_me(user: AuthedUser = Depends(get_current_user)):
    auth_user = _fetch_auth_user(user.access_token)
    profile = _ensure_profile_row(user)
    return _serialize(auth_user, profile)


@router.post("/me/avatar")
async def upload_me_avatar(
    file: UploadFile = File(...),
    user: AuthedUser = Depends(get_current_user),
):
    from lib.avatars import upload_avatar

    raw = await file.read()
    content_type = (file.content_type or "").strip() or "image/jpeg"
    try:
        url = upload_avatar(
            user_id=user.id,
            content_type=content_type,
            file_bytes=raw,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not upload avatar",
        ) from exc

    updated = (
        user.db.table("profiles")
        .update({"avatar_url": url})
        .eq("id", user.id)
        .execute()
    )
    rows = updated.data or []
    if not rows:
        _ensure_profile_row(user)
        updated = (
            user.db.table("profiles")
            .update({"avatar_url": url})
            .eq("id", user.id)
            .execute()
        )
        rows = updated.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save avatar",
        )

    auth_user = _fetch_auth_user(user.access_token)
    return _serialize(auth_user, rows[0])


@router.patch("/me")
def update_me(
    body: UserProfileUpdate,
    user: AuthedUser = Depends(get_current_user),
):
    profile = _ensure_profile_row(user)
    auth_user = _fetch_auth_user(user.access_token)
    patch = body.model_dump(exclude_unset=True)

    profile_updates: dict[str, Any] = {}
    if "business_name" in patch:
        raw = patch.get("business_name")
        profile_updates["business_name"] = (
            str(raw).strip() or None if raw is not None else None
        )
    if "notification_channel" in patch and patch["notification_channel"] is not None:
        profile_updates["notification_channel"] = patch["notification_channel"]
    if "role" in patch and patch["role"] is not None:
        # Allow role set at signup / early profile; claim flow may also set tenant.
        profile_updates["role"] = patch["role"]
    if "signup_persona" in patch:
        profile_updates["signup_persona"] = patch.get("signup_persona")
    if "signup_unit_count" in patch:
        profile_updates["signup_unit_count"] = patch.get("signup_unit_count")
    if "signup_years" in patch:
        profile_updates["signup_years"] = patch.get("signup_years")

    if profile_updates:
        updated = (
            user.db.table("profiles")
            .update(profile_updates)
            .eq("id", user.id)
            .execute()
        )
        rows = updated.data or []
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )
        profile = rows[0]

    auth_attributes: dict[str, Any] = {}
    meta = auth_user.user_metadata or {}
    if not isinstance(meta, dict):
        meta = {}

    if "name" in patch:
        name = str(patch.get("name") or "").strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Name is required",
            )
        auth_attributes["data"] = {
            **meta,
            "full_name": name,
            "name": name,
        }

    if "email" in patch:
        email = str(patch.get("email") or "").strip() or None
        if email:
            auth_attributes["email"] = email

    if auth_attributes:
        _update_auth_user(user.access_token, user.id, auth_attributes)
        auth_user = _fetch_auth_user(user.access_token)

    return _serialize(auth_user, profile)
