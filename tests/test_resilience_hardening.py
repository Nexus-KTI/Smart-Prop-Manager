"""Focused regression tests for payment, outbox, and limiter resilience."""

from __future__ import annotations

import inspect
import os
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from lib import auth, autopay_job, db as db_module, delivery_outbox, http_client, rate_limit
from routers import payments


ROOT = Path(__file__).resolve().parents[1]


class _Rpc:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return SimpleNamespace(data=self._data)


class _RpcDb:
    def __init__(self, claimed=None):
        self.claimed = claimed or []
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        if name == "claim_delivery_outbox":
            return _Rpc(self.claimed)
        if name in {"complete_delivery_outbox", "fail_delivery_outbox"}:
            return _Rpc(True)
        if name == "consume_rate_limit":
            return _Rpc({"allowed": len(self.calls) < 2})
        raise AssertionError(name)


def test_autopay_cycle_key_and_reference_are_stable_and_scoped():
    first = autopay_job._stable_autopay_keys("tenancy-1", date(2026, 9, 17))
    replay = autopay_job._stable_autopay_keys("tenancy-1", date(2026, 9, 17))
    later = autopay_job._stable_autopay_keys("tenancy-1", date(2026, 10, 17))
    other = autopay_job._stable_autopay_keys("tenancy-2", date(2026, 9, 17))
    assert first == replay
    assert len({first, later, other}) == 3
    assert first[0] == "autopay:tenancy-1:2026-09-17"
    assert first[1].startswith("nexora_ap_")


def test_confirm_never_falls_back_to_inserting_a_paid_transaction():
    source = inspect.getsource(payments.confirm_paystack_payment)
    assert "No matching pending payment" in source
    assert ".insert(row)" not in source
    assert "payment reference does not match" in source.lower()


def test_paystack_binding_requires_exact_ledger_values():
    transaction = {
        "id": "txn-1",
        "unit_id": "unit-1",
        "amount": 2500,
        "charge_type": "rent",
        "payment_reference": "ref-1",
    }
    exact = {
        "reference": "ref-1",
        "currency": "NGN",
        "amount": 250000,
        "metadata": {
            "transaction_id": "txn-1",
            "unit_id": "unit-1",
            "charge_type": "rent",
        },
    }
    payments._validate_paystack_binding(exact, transaction, reference="ref-1")
    for field, value in (
        ("currency", "USD"),
        ("amount", 249900),
        ("metadata", {"transaction_id": "other", "unit_id": "unit-1"}),
    ):
        mismatched = {**exact, field: value}
        with pytest.raises(HTTPException) as exc:
            payments._validate_paystack_binding(
                mismatched,
                transaction,
                reference="ref-1",
            )
        assert exc.value.status_code == 409
    with pytest.raises(HTTPException):
        payments._validate_paystack_binding(
            exact,
            transaction,
            reference="ref-1",
            expected_purpose="saved_card_rent",
        )


def test_saved_card_charge_has_no_fabricated_paid_fallback():
    source = inspect.getsource(payments.charge_saved_card)
    assert "claim_autopay_transaction" in source
    assert "verify_transaction(reference)" in source
    assert 'or {**txn, "status": "paid"' not in source
    assert "Saved-card payment could not be reconciled" in source


def test_resilience_migration_has_concurrency_and_uniqueness_guards():
    sql = (
        ROOT / "sql" / "032_resilience_payments_outbox_limits.sql"
    ).read_text(encoding="utf-8")
    assert "transactions_paystack_reference_unique_idx" in sql
    assert "transactions_idempotency_key_unique" in sql
    assert "transactions_amount_positive_check" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "for update skip locked" in sql.lower()
    assert "lease_token" in sql
    assert "transactions_queue_paid_receipt" in sql
    assert "nexora_private.queue_paid_transaction_receipt" in sql
    assert "status in ('pending', 'processing', 'retry', 'sent', 'dead')" in sql


def test_outbox_worker_acknowledges_one_claim(monkeypatch):
    delivery = {
        "id": "d1",
        "lease_token": "lease-1",
        "attempt_count": 1,
        "max_attempts": 5,
        "event_name": "notification",
        "payload": {},
    }
    db = _RpcDb([delivery])
    monkeypatch.setattr(delivery_outbox, "_deliver", lambda *_args: "provider-1")
    result = delivery_outbox.process_delivery_outbox(db=db)
    assert result == {"claimed": 1, "sent": 1, "retried": 0, "dead": 0}
    assert [name for name, _params in db.calls] == [
        "claim_delivery_outbox",
        "complete_delivery_outbox",
    ]


def test_outbox_worker_retries_transient_failure(monkeypatch):
    delivery = {
        "id": "d1",
        "lease_token": "lease-1",
        "attempt_count": 2,
        "max_attempts": 5,
        "event_name": "notification",
        "payload": {},
    }
    db = _RpcDb([delivery])

    def fail(*_args):
        raise TimeoutError("provider timed out")

    monkeypatch.setattr(delivery_outbox, "_deliver", fail)
    result = delivery_outbox.process_delivery_outbox(db=db)
    assert result["retried"] == 1
    assert result["dead"] == 0
    assert db.calls[-1][0] == "fail_delivery_outbox"
    assert db.calls[-1][1]["p_permanent"] is False


def test_outbox_worker_dead_letters_permanent_failure(monkeypatch):
    delivery = {
        "id": "d1",
        "lease_token": "lease-1",
        "attempt_count": 1,
        "max_attempts": 5,
        "event_name": "notification",
        "payload": {},
    }
    db = _RpcDb([delivery])

    def fail(*_args):
        raise RuntimeError("Email not configured")

    monkeypatch.setattr(delivery_outbox, "_deliver", fail)
    result = delivery_outbox.process_delivery_outbox(db=db)
    assert result["dead"] == 1
    assert db.calls[-1][1]["p_permanent"] is True


def test_distributed_rate_limit_raises_429(monkeypatch):
    db = _RpcDb()
    monkeypatch.setattr("lib.db.create_service_client", lambda: db)
    rate_limit.enforce_rate_limit("same-client", limit=2, window_seconds=60)
    with pytest.raises(HTTPException) as exc:
        rate_limit.enforce_rate_limit("same-client", limit=2, window_seconds=60)
    assert exc.value.status_code == 429


def test_distributed_rate_limit_fails_closed(monkeypatch):
    def unavailable():
        raise RuntimeError("database offline")

    monkeypatch.setattr("lib.db.create_service_client", unavailable)
    with pytest.raises(HTTPException) as exc:
        rate_limit.enforce_rate_limit("client", limit=2, window_seconds=60)
    assert exc.value.status_code == 503


def test_shared_http_client_reuses_pool_and_closes_cleanly():
    first = http_client.get_http_client()
    assert http_client.get_http_client() is first
    http_client.close_http_client()
    second = http_client.get_http_client()
    assert second is not first
    http_client.close_http_client()


def test_authenticated_client_dependency_always_closes_transport():
    source = inspect.getsource(auth.get_current_user)
    assert "finally:" in source
    assert "close_user_client(db)" in source


def test_server_supabase_clients_disable_session_state():
    source = inspect.getsource(db_module._new_client)
    assert "auto_refresh_token=False" in source
    assert "persist_session=False" in source


def test_interactive_notify_paths_enqueue_not_send_inline():
    from routers import applications, artisans, leads, reminders, staff, tenancies

    assert "_queue_tenant_notice" in inspect.getsource(reminders.send_reminder)
    assert "_queue_tenant_notice" in inspect.getsource(reminders.send_bulk_reminders)
    assert "_queue_tenant_notice" in inspect.getsource(reminders.retry_reminder)
    assert "send_notification(" not in inspect.getsource(reminders.send_reminder)
    assert "enqueue_notification" in inspect.getsource(tenancies.invite_tenant)
    assert "enqueue_notification" in inspect.getsource(artisans.invite_artisan)
    assert "enqueue_notification" in inspect.getsource(staff.invite_staff)
    assert "enqueue_notification" in inspect.getsource(leads.invite_lead)
    assert "enqueue_notification" in inspect.getsource(applications.connect_landlord)

def test_receipt_delivery_is_step_idempotent():
    source = inspect.getsource(payments.deliver_payment_receipt)
    assert "require_tenant_notify" in source
    assert "_tenant_receipt_notice_already_sent" in source
    assert "existing_url" in source or 'receipt_url") or "").strip()' in source
    outbox_source = inspect.getsource(delivery_outbox._deliver)
    assert "require_tenant_notify=True" in outbox_source


def test_reminders_queued_status_migration_present():
    sql = (ROOT / "sql" / "033_reminders_queued_status.sql").read_text(
        encoding="utf-8"
    )
    assert "'queued'::text" in sql
    assert "reminders_status_check" in sql


def test_jwt_verify_retries_with_backoff():
    source = inspect.getsource(auth.verify_access_token)
    assert "range(2)" in source
    assert "time.sleep(0.15)" in source
    assert "TransportError" in source


def test_landlord_retry_paths_enqueue_not_send_inline():
    from routers import reminders

    source = inspect.getsource(reminders.retry_reminder)
    assert "_queue_tenant_notice" in source
    assert "landlord_money_in" in source
    assert "landlord_renewal" in source
    assert "notify_landlord_payment_received(" not in source
    assert "send_email(" not in source
