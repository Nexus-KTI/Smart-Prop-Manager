"""Focused regression tests for payment, outbox, and limiter resilience."""

from __future__ import annotations

import base64
import inspect
import json
import os
import time
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
        if name in {"complete_delivery_outbox", "fail_delivery_outbox", "defer_delivery_outbox"}:
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
    assert "claim_saved_card_transaction" in source
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


def test_flush_uses_service_client_when_the_user_cannot_claim(monkeypatch):
    service = _RpcDb([])
    monkeypatch.setattr("lib.db.create_service_client", lambda: service)

    class Denied:
        def rpc(self, name, params):
            raise RuntimeError("permission denied for function claim_delivery_outbox")

    result = delivery_outbox.flush_delivery_outbox(db=Denied(), batch_size=5)
    assert result == {"claimed": 0, "sent": 0, "retried": 0, "dead": 0, "deferred": 0}
    assert service.calls[0][0] == "claim_delivery_outbox"


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
    assert result == {"claimed": 1, "sent": 1, "retried": 0, "dead": 0, "deferred": 0}
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


def test_user_clients_share_one_socket_pool_without_sharing_auth():
    first = db_module.create_user_client("token-a")
    second = db_module.create_user_client("token-b")
    try:
        first_http = db_module._client_transports[id(first)]
        second_http = db_module._client_transports[id(second)]
        assert first_http is not second_http
        assert first_http._transport is db_module._pool is second_http._transport
        assert first.postgrest.headers["Authorization"] == "Bearer token-a"
        assert second.postgrest.headers["Authorization"] == "Bearer token-b"
    finally:
        db_module.close_user_client(first)
        db_module.close_user_client(second)
    assert db_module._pool._inner is not None
    third = db_module.create_user_client("token-c")
    db_module.close_user_client(third)


def test_interactive_notify_paths_enqueue_not_send_inline():
    from routers import applications, artisans, leads, reminders, staff, tenancies

    assert "_queue_tenant_notice" in inspect.getsource(reminders.send_reminder)
    assert "_queue_tenant_notice" in inspect.getsource(reminders.send_bulk_reminders)
    assert "_queue_tenant_notice" in inspect.getsource(reminders.retry_reminder)
    assert "send_notification(" not in inspect.getsource(reminders.send_reminder)
    assert "issue_tenancy_claim(" in inspect.getsource(tenancies.invite_tenant)
    assert "enqueue_notification" in inspect.getsource(tenancies.issue_tenancy_claim)
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


def _fake_jwt(exp: float) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode()
    return f"h.{payload.rstrip('=')}.s"


class _CountingAuth:
    def __init__(self, error: Exception | None = None):
        self.calls = 0
        self.error = error

    def get_user(self, _token):
        self.calls += 1
        if self.error:
            raise self.error
        return SimpleNamespace(user=SimpleNamespace(id="u1", email="a@b.c"))


def _with_auth(monkeypatch, fake):
    monkeypatch.setattr(auth, "_TOKEN_CACHE", {})
    monkeypatch.setattr(auth, "create_anon_client", lambda: SimpleNamespace(auth=fake))


def test_verified_token_is_reused_without_another_gotrue_call(monkeypatch):
    fake = _CountingAuth()
    _with_auth(monkeypatch, fake)
    token = _fake_jwt(time.time() + 3600)
    first = auth.verify_access_token(token)
    second = auth.verify_access_token(token)
    assert first is second
    assert fake.calls == 1
    assert token not in auth._TOKEN_CACHE


def test_token_cache_never_outlives_the_jwt(monkeypatch):
    fake = _CountingAuth()
    _with_auth(monkeypatch, fake)
    token = _fake_jwt(time.time() + 1)
    auth.verify_access_token(token)
    (until, _response), = auth._TOKEN_CACHE.values()
    assert until <= time.time() + 1.01
    monkeypatch.setattr(auth.time, "time", lambda: until + 0.01)
    auth.verify_access_token(token)
    assert fake.calls == 2


def test_rejected_token_is_not_cached(monkeypatch):
    from supabase_auth.errors import AuthApiError

    fake = _CountingAuth(error=AuthApiError("bad jwt", 401, None))
    _with_auth(monkeypatch, fake)
    token = _fake_jwt(time.time() + 3600)
    for _ in range(2):
        with pytest.raises(AuthApiError):
            auth.verify_access_token(token)
    assert fake.calls == 2
    assert auth._TOKEN_CACHE == {}


class _GuardQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.filters: dict[str, object] = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def like(self, column, value):
        self.filters[f"{column}~"] = value
        return self

    def gt(self, column, value):
        self.filters[f"{column}>"] = value
        return self

    def in_(self, column, values):
        self.filters[column] = tuple(values)
        return self

    def or_(self, expr):
        self.filters["or"] = expr
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, _n):
        return self

    def range(self, *_args):
        return self

    def execute(self):
        if self.table == "units":
            return SimpleNamespace(data=[self.db.unit])
        if "idempotency_key" in self.filters:
            return SimpleNamespace(data=self.db.same_key)
        return SimpleNamespace(data=self.db.paid)


class _GuardDb:
    def __init__(self, *, unit=None, same_key=(), paid=()):
        self.unit = unit or {"id": "unit-1", "frequency": "monthly", "due_day": 1, "rent_amount": 1000}
        self.same_key = list(same_key)
        self.paid = list(paid)

    def table(self, name):
        return _GuardQuery(self, name)


def _paid_today(amount=1000):
    from lib.reminder_job import _today_lagos

    return [
        {
            "id": f"txn-{amount}",
            "unit_id": "unit-1",
            "status": "paid",
            "charge_type": "rent",
            "amount": amount,
            "paid_at": f"{_today_lagos().isoformat()}T09:00:00+00:00",
        }
    ]


def test_saved_card_refuses_second_charge_for_a_paid_month():
    with pytest.raises(HTTPException) as exc:
        payments._guard_new_saved_card_charge(
            _GuardDb(paid=_paid_today()), "unit-1", "saved-card:u1:new-key"
        )
    assert exc.value.status_code == 409
    assert "already paid" in exc.value.detail


def test_saved_card_claim_serialises_per_unit():
    sql = (ROOT / "sql" / "046_claim_saved_card_transaction.sql").read_text(encoding="utf-8")
    assert "'saved-card-unit:' || p_unit_id::text" in sql
    assert "processing_lease_expires_at > now()" in sql
    assert "'busy', true" in sql
    assert "return public.claim_autopay_transaction(" in sql
    assert "to service_role" in sql


def test_saved_card_replay_of_same_key_skips_period_guard():
    payments._guard_new_saved_card_charge(
        _GuardDb(same_key=[{"id": "txn-1"}], paid=_paid_today()),
        "unit-1",
        "saved-card:u1:same-key",
    )


def test_saved_card_weekly_unit_can_pay_again_in_the_same_month():
    payments._guard_new_saved_card_charge(
        _GuardDb(unit={"id": "unit-1", "frequency": "weekly", "due_day": 2}, paid=_paid_today()),
        "unit-1",
        "saved-card:u1:new-key",
    )


def test_saved_card_allows_paying_the_rest_after_a_part_payment():
    payments._guard_new_saved_card_charge(
        _GuardDb(paid=_paid_today(amount=400)), "unit-1", "saved-card:u1:new-key"
    )


class _ReminderQuery(_GuardQuery):
    def in_(self, column, values):
        self.filters[column] = tuple(values)
        return self

    def is_(self, column, value):
        self.filters[f"{column} is"] = value
        return self

    def gte(self, column, value):
        self.filters[f"{column}>="] = value
        return self

    def execute(self):
        rows = [
            r
            for r in self.db.reminders
            if r["kind"] == self.filters.get("kind")
            and r["status"] in self.filters.get("status", ())
            and (
                r.get("transaction_id") == self.filters["transaction_id"]
                if "transaction_id" in self.filters
                else r.get("transaction_id") is None
                and r["unit_id"] == self.filters.get("unit_id")
            )
        ]
        return SimpleNamespace(data=rows)


class _ReminderDb:
    def __init__(self, reminders):
        self.reminders = reminders

    def table(self, _name):
        return _ReminderQuery(self, "reminders")


def test_receipt_dedupe_is_per_transaction_not_per_unit_window():
    db = _ReminderDb(
        [{"unit_id": "unit-1", "kind": "receipt", "status": "sent", "transaction_id": "txn-a"}]
    )
    assert payments._tenant_receipt_notice_already_sent(db, "unit-1", None, "txn-a")
    assert not payments._tenant_receipt_notice_already_sent(db, "unit-1", None, "txn-b")
    assert not payments._landlord_payment_notice_already_sent(db, "unit-1", None, "txn-a")


def test_receipt_dedupe_still_honours_legacy_rows_without_transaction_id():
    db = _ReminderDb([{"unit_id": "unit-1", "kind": "landlord_payment", "status": "sent"}])
    assert payments._landlord_payment_notice_already_sent(db, "unit-1", None, "txn-a")


def test_reminders_transaction_id_migration_present():
    sql = (ROOT / "sql" / "044_reminders_transaction_id.sql").read_text(encoding="utf-8")
    assert "add column if not exists transaction_id" in sql
    assert "reminders_transaction_kind_done_idx" in sql


class _Storage:
    def __init__(self, missing=False, create_error=None):
        self.calls: list[str] = []
        self.missing = missing
        self.create_error = create_error

    def get_bucket(self, name):
        self.calls.append(f"get:{name}")
        if self.missing:
            raise RuntimeError("not found")

    def update_bucket(self, name, options=None):
        self.calls.append(f"update:{name}")

    def create_bucket(self, name, options=None):
        self.calls.append(f"create:{name}")
        if self.create_error:
            raise self.create_error


def test_bucket_setup_runs_once_per_process(monkeypatch):
    from lib import storage_buckets

    monkeypatch.setattr(storage_buckets, "_ENSURED", set())
    storage = _Storage()
    client = SimpleNamespace(storage=storage)
    for _ in range(3):
        storage_buckets.ensure_public_bucket(client, "avatars")
    assert storage.calls == ["get:avatars", "update:avatars"]


def test_failed_bucket_setup_is_retried_next_upload(monkeypatch):
    from lib import storage_buckets

    monkeypatch.setattr(storage_buckets, "_ENSURED", set())
    storage = _Storage(missing=True, create_error=RuntimeError("storage down"))
    client = SimpleNamespace(storage=storage)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            storage_buckets.ensure_public_bucket(client, "unit-photos")
    assert storage.calls.count("create:unit-photos") == 2


def test_upload_routes_do_not_block_the_event_loop():
    from routers import maintenance, messages, properties, users

    for route in (
        users.upload_me_avatar,
        maintenance.upload_my_request_photo,
        properties.upload_unit_apply_photo,
        messages.send_media_message,
    ):
        assert not inspect.iscoroutinefunction(route), route.__name__
        source = inspect.getsource(route)
        assert "file.file.read(MAX_" in source, route.__name__
    webhook = inspect.getsource(payments.paystack_webhook)
    assert "run_in_threadpool(_apply_paystack_event" in webhook
    assert "create_service_client" not in webhook


def test_landlord_retry_paths_enqueue_not_send_inline():
    from routers import reminders

    source = inspect.getsource(reminders.retry_reminder)
    assert "_queue_tenant_notice" in source
    assert "landlord_money_in" in source
    assert "landlord_renewal" in source
    assert "notify_landlord_payment_received(" not in source
    assert "send_email(" not in source
