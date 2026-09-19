"""Tenant payments reuse the landlord Paystack / receipt path (Phase 3)."""

from __future__ import annotations

import inspect

from routers import payments


def test_paystack_paths_set_initiated_by_from_access_role():
    pending_src = inspect.getsource(payments.create_pending_paystack_payment)
    confirm_src = inspect.getsource(payments.confirm_paystack_payment)
    assert '_unit_access_role' in pending_src
    assert '"initiated_by": role' in pending_src or "'initiated_by': role" in pending_src
    assert "No matching pending payment" in confirm_src
    assert ".insert(row)" not in confirm_src


def test_tenant_and_landlord_paystack_share_queued_receipt_delivery():
    pending_src = inspect.getsource(payments.create_pending_paystack_payment)
    confirm_src = inspect.getsource(payments.confirm_paystack_payment)
    manual_src = inspect.getsource(payments.record_manual_payment)
    assert "_queue_paid_side_effects" in confirm_src
    assert "_queue_paid_side_effects" in manual_src
    # Pending creates the row; confirm/webhook finalize with the shared helper.
    assert "initiated_by" in pending_src
    assert "create_service_client" in pending_src  # tenant insert path


def test_unit_access_role_recognizes_tenant():
    src = inspect.getsource(payments._unit_access_role)
    assert "tenant_user_id" in src
    assert 'return "tenant"' in src
    assert 'return "landlord"' in src
