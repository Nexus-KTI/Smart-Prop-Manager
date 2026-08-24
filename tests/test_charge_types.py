"""Unit tests for Phase 2 charge-type payload normalization."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException
import pytest

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from routers.payments import _normalize_charge_fields  # noqa: E402


def test_default_charge_type_is_rent():
    assert _normalize_charge_fields({}) == ("rent", None)
    assert _normalize_charge_fields({"charge_type": "RENT"}) == ("rent", None)


def test_service_charge_strips_label():
    assert _normalize_charge_fields(
        {"charge_type": "service_charge", "charge_label": "ignored"}
    ) == ("service_charge", None)


def test_other_requires_label():
    with pytest.raises(HTTPException) as exc:
        _normalize_charge_fields({"charge_type": "other"})
    assert exc.value.status_code == 400


def test_other_keeps_label():
    assert _normalize_charge_fields(
        {"charge_type": "other", "charge_label": " Generator fuel "}
    ) == ("other", "Generator fuel")


def test_invalid_charge_type():
    with pytest.raises(HTTPException) as exc:
        _normalize_charge_fields({"charge_type": "fee"})
    assert exc.value.status_code == 400
