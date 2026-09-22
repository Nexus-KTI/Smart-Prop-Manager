"""Signup attribution fields on UserProfileUpdate."""

from __future__ import annotations

import os

# lib.auth / routers.users import lib.db which requires env at import time.
os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

import pytest
from pydantic import ValidationError

from routers.users import UserProfileUpdate


def test_signup_attribution_fields_accept_valid():
    payload = UserProfileUpdate(
        signup_referral_code="  ADA-FRIEND  ",
        signup_attribution="whatsapp",
        company_name=" Lekki Court Mgmt ",
    )
    assert payload.signup_referral_code == "  ADA-FRIEND  "
    assert payload.signup_attribution == "whatsapp"
    assert payload.company_name == " Lekki Court Mgmt "


def test_signup_attribution_rejects_unknown():
    with pytest.raises(ValidationError):
        UserProfileUpdate(signup_attribution="tiktok")  # type: ignore[arg-type]


def test_signup_referral_code_max_length():
    with pytest.raises(ValidationError):
        UserProfileUpdate(signup_referral_code="x" * 65)


def test_company_name_max_length():
    with pytest.raises(ValidationError):
        UserProfileUpdate(company_name="y" * 121)


@pytest.mark.parametrize(
    "value",
    ["whatsapp", "instagram", "friend", "google", "agent", "other"],
)
def test_signup_attribution_enum_values(value: str):
    payload = UserProfileUpdate(signup_attribution=value)  # type: ignore[arg-type]
    assert payload.signup_attribution == value
