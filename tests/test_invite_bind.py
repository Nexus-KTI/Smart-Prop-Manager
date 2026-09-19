"""Invite contact binding helpers."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from lib.invite_bind import contacts_match, normalize_invite_contact, require_invite_contact_match


def test_normalize_phone_and_email():
    assert normalize_invite_contact("Ada@Example.com") == "ada@example.com"
    assert normalize_invite_contact("08012345678") == "+2348012345678"
    assert normalize_invite_contact("+234 801 234 5678") == "+2348012345678"


def test_contacts_match_phone_variants():
    assert contacts_match("08012345678", "+2348012345678")
    assert contacts_match("ada@x.com", "Ada@X.com")
    assert not contacts_match("08012345678", "08099999999")
    assert not contacts_match("a@b.com", "08012345678")


def test_require_match_rejects_empty_invite(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        require_invite_contact_match("", "token")
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc2:
        require_invite_contact_match(None, "token")
    assert exc2.value.status_code == 403


def test_require_match_allows_when_identity_matches(monkeypatch):
    monkeypatch.setattr(
        "lib.invite_bind.claimant_identity_strings",
        lambda _token: ["+2348012345678"],
    )
    require_invite_contact_match("08012345678", "token")


def test_require_match_blocks_mismatch(monkeypatch):
    monkeypatch.setattr(
        "lib.invite_bind.claimant_identity_strings",
        lambda _token: ["other@example.com"],
    )
    with pytest.raises(HTTPException) as exc:
        require_invite_contact_match("08012345678", "token")
    assert exc.value.status_code == 403


def test_claimant_identity_ignores_metadata(monkeypatch):
    class FakeUser:
        email = "real@example.com"
        phone = "+2348011111111"
        user_metadata = {"phone": "+2348099999999", "whatsapp": "+2348088888888"}

    class FakeResp:
        user = FakeUser()

    monkeypatch.setattr("lib.auth.verify_access_token", lambda _t: FakeResp())
    from lib.invite_bind import claimant_identity_strings

    ids = claimant_identity_strings("tok")
    assert ids == ["real@example.com", "+2348011111111"]
    assert "+2348099999999" not in ids
