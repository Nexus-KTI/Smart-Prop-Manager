"""Unit apply photo validation, note cap, and public preview fields."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from lib.unit_photos import validate_unit_photo
from routers.applications import apply_preview_payload
from routers.properties import normalize_apply_note


def test_validate_unit_photo_rejects_type_and_size():
    with pytest.raises(ValueError, match="JPEG"):
        validate_unit_photo("application/pdf", b"not-an-image")
    with pytest.raises(ValueError, match="5 MB"):
        validate_unit_photo("image/jpeg", b"x" * (5 * 1024 * 1024 + 1))
    assert validate_unit_photo("image/png", b"png") == "png"


def test_normalize_apply_note_caps_and_clears():
    assert normalize_apply_note("  2 bed, Lekki  ") == "2 bed, Lekki"
    assert normalize_apply_note("   ") is None
    assert normalize_apply_note(None) is None
    with pytest.raises(HTTPException) as ei:
        normalize_apply_note("n" * 281)
    assert ei.value.status_code == 400


def test_apply_preview_includes_photo_and_note():
    payload = apply_preview_payload(
        {
            "status": "open",
            "units": {
                "label": "Flat 2",
                "rent_amount": 150000,
                "photo_url": "https://example.com/unit.jpg",
                "apply_note": "Available 1 Oct",
            },
            "properties": {"name": "Palm Court", "address": "Lekki"},
        },
        "tok",
    )
    assert payload["photo_url"] == "https://example.com/unit.jpg"
    assert payload["apply_note"] == "Available 1 Oct"
    assert payload["unit_label"] == "Flat 2"
    assert payload["rent_amount"] == 150000
    assert payload["token"] == "tok"
