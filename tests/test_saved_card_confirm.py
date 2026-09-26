"""Saved-card confirm rejects mismatched Paystack payloads."""

from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from routers import payments


def test_confirm_saved_card_rejects_wrong_purpose_or_amount():
    user = SimpleNamespace(id="u1", db=SimpleNamespace())

    with patch(
        "routers.payments.verify_transaction",
        return_value={
            "currency": "NGN",
            "amount": 10000,
            "metadata": {"purpose": "rent"},
            "authorization": {"authorization_code": "AUTH_x", "reusable": True},
            "customer": {},
        },
    ):
        with pytest.raises(HTTPException) as ei:
            payments.confirm_saved_card({"reference": "ref-1"}, user)
        assert ei.value.status_code == 409

    with patch(
        "routers.payments.verify_transaction",
        return_value={
            "currency": "NGN",
            "amount": 50000,
            "metadata": {"purpose": "save_card"},
            "authorization": {"authorization_code": "AUTH_x", "reusable": True},
            "customer": {},
        },
    ):
        with pytest.raises(HTTPException) as ei:
            payments.confirm_saved_card({"reference": "ref-2"}, user)
        assert ei.value.status_code == 409
