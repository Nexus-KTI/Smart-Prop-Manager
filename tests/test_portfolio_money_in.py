"""Unit tests for portfolio money-in feed shaping."""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from routers.payments import _flatten_portfolio_payment  # noqa: E402


def test_flatten_portfolio_payment_nested_join():
    row = {
        "id": "txn-1",
        "unit_id": "unit-1",
        "amount": 250000,
        "status": "paid",
        "method": "manual",
        "paid_at": "2026-08-05T10:00:00+00:00",
        "receipt_url": "https://example.com/r.pdf",
        "payment_reference": "ref-1",
        "charge_type": "service_charge",
        "charge_label": None,
        "created_at": "2026-08-05T10:00:00+00:00",
        "units": {
            "id": "unit-1",
            "label": "Flat 1",
            "tenant_name": " Ada Tenant ",
            "properties": {"id": "prop-1", "name": "Smoke Court", "owner_id": "owner-1"},
        },
    }
    item = _flatten_portfolio_payment(dict(row))
    assert item["id"] == "txn-1"
    assert item["unit_id"] == "unit-1"
    assert item["property_name"] == "Smoke Court"
    assert item["unit_label"] == "Flat 1"
    assert item["tenant_name"] == "Ada Tenant"
    assert item["method"] == "manual"
    assert item["charge_type"] == "service_charge"
    assert "units" not in item


def test_flatten_portfolio_payment_list_shaped_join():
    row = {
        "id": "txn-2",
        "unit_id": "unit-2",
        "amount": 1000,
        "status": "paid",
        "method": "paystack",
        "paid_at": None,
        "receipt_url": None,
        "payment_reference": None,
        "created_at": "2026-08-06T10:00:00+00:00",
        "units": [
            {
                "id": "unit-2",
                "label": "Flat 2",
                "tenant_name": None,
                "properties": [{"id": "prop-2", "name": "Yard House", "owner_id": "o"}],
            }
        ],
    }
    item = _flatten_portfolio_payment(row)
    assert item["property_name"] == "Yard House"
    assert item["unit_label"] == "Flat 2"
    assert item["tenant_name"] == ""
