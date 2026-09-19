"""Invite claim contact binding (token alone is not enough)."""

from __future__ import annotations

import re

from fastapi import HTTPException, status

from lib.notify import normalize_e164


def normalize_invite_contact(raw: str | None) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    if "@" in value:
        return value.lower()
    try:
        return normalize_e164(value)
    except Exception:
        digits = re.sub(r"\D", "", value)
        return digits[-10:] if len(digits) >= 10 else digits


def contacts_match(invite_contact: str, candidate: str) -> bool:
    left = normalize_invite_contact(invite_contact)
    right = normalize_invite_contact(candidate)
    if not left or not right:
        return False
    if left == right:
        return True
    # Last-10 digit fallback for phones stored without country code.
    if "@" not in left and "@" not in right:
        return left[-10:] == right[-10:]
    return False


def claimant_identity_strings(access_token: str) -> list[str]:
    """
    Verified email + phone from the JWT user only.

    Do not trust user_metadata — clients can set phone/whatsapp there.
    """
    from lib.auth import verify_access_token

    response = verify_access_token(access_token)
    user = response.user
    if user is None:
        return []
    out: list[str] = []
    email = (user.email or "").strip()
    if email:
        out.append(email)
    phone = (getattr(user, "phone", None) or "").strip()
    if phone:
        out.append(phone)
    return out


def require_invite_contact_match(
    invite_contact: str | None,
    access_token: str,
    *,
    detail: str = "Sign in with the phone or email this invite was sent to.",
) -> None:
    """
    Fail closed when the invite has a contact and the claimant does not match.

    Empty invite_contact is rejected (legacy rows must be backfilled before claim).
    """
    expected = (invite_contact or "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invite is missing a contact. Ask your landlord to resend it.",
        )
    identities = claimant_identity_strings(access_token)
    if any(contacts_match(expected, identity) for identity in identities):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=detail,
    )
