"""Send hardening: outbox defer/lease/throttle, permanent errors, idempotent sends, limits."""

from __future__ import annotations

import inspect
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from lib import delivery_outbox, idempotency, notify, rate_limit
from lib.circuit import CircuitOpenError

ROOT = Path(__file__).resolve().parents[1]


class _Rpc:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return SimpleNamespace(data=self._data)


class _OutboxDb:
    def __init__(self, claimed):
        self.claimed = claimed
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        if name == "claim_delivery_outbox":
            return _Rpc(self.claimed)
        return _Rpc(True)


def _delivery(i: int = 1) -> dict:
    return {
        "id": f"d{i}",
        "lease_token": f"lease-{i}",
        "attempt_count": 1,
        "max_attempts": 5,
        "event_name": "notification",
        "payload": {},
    }


# --- Permanent provider errors ---------------------------------------------


def _twilio_error(status: int):
    from twilio.base.exceptions import TwilioRestException

    return TwilioRestException(status, "https://api.twilio.com", msg="rejected")


class _TwilioClient:
    def __init__(self, exc):
        self.messages = SimpleNamespace(create=self._create)
        self._exc = exc

    def _create(self, **_kwargs):
        raise self._exc


def test_twilio_bad_number_is_permanent():
    with pytest.raises(notify.PermanentDeliveryError):
        notify._twilio_create(_TwilioClient(_twilio_error(400)), to="+2348000000000")


def test_twilio_rate_limit_is_not_permanent():
    from twilio.base.exceptions import TwilioRestException

    with pytest.raises(TwilioRestException) as exc:
        notify._twilio_create(_TwilioClient(_twilio_error(429)), to="+2348000000000")
    assert not isinstance(exc.value, notify.PermanentDeliveryError)


@pytest.mark.parametrize("code,permanent", [(400, True), (401, True), (429, False), (408, False)])
def test_mailgun_4xx_classification(monkeypatch, code, permanent):
    monkeypatch.setenv("MAILGUN_API_KEY", "key")
    monkeypatch.setenv("MAILGUN_DOMAIN", "mg.example.com")
    response = SimpleNamespace(status_code=code, text="nope")
    monkeypatch.setattr(
        notify, "get_http_client", lambda: SimpleNamespace(post=lambda *a, **k: response)
    )
    with pytest.raises(RuntimeError) as exc:
        notify._send_email_mailgun("a@b.co", "hi", subject="s")
    assert isinstance(exc.value, notify.PermanentDeliveryError) is permanent


def test_outbox_dead_letters_permanent_delivery_error():
    assert delivery_outbox._is_permanent_failure(notify.PermanentDeliveryError("bad number"))
    assert not delivery_outbox._is_permanent_failure(TimeoutError("slow"))


# --- Lease sizing, release, defer ------------------------------------------


def test_lease_covers_the_whole_batch():
    assert delivery_outbox.lease_for(1, 120) == 120
    assert delivery_outbox.lease_for(25, 120) == 25 * delivery_outbox.PER_DELIVERY_BUDGET_SEC
    assert delivery_outbox.lease_for(500, 120) == delivery_outbox.MAX_LEASE_SEC


def test_claim_requests_the_sized_lease(monkeypatch):
    db = _OutboxDb([])
    delivery_outbox.process_delivery_outbox(db=db, batch_size=25, lease_seconds=120)
    assert db.calls[0][1]["p_lease_seconds"] == 750


def test_circuit_open_defers_without_spending_an_attempt(monkeypatch):
    db = _OutboxDb([_delivery()])

    def open_circuit(*_a):
        raise CircuitOpenError("Twilio", 20)

    monkeypatch.setattr(delivery_outbox, "_deliver", open_circuit)
    stats = delivery_outbox.process_delivery_outbox(db=db)
    assert stats["deferred"] == 1 and stats["retried"] == 0 and stats["dead"] == 0
    names = [name for name, _ in db.calls]
    assert "defer_delivery_outbox" in names
    assert "fail_delivery_outbox" not in names


def test_rows_near_lease_expiry_are_released_unsent(monkeypatch):
    db = _OutboxDb([_delivery(1), _delivery(2)])
    sent: list[str] = []
    clock = iter([0.0, 0.0, 10_000.0])
    monkeypatch.setattr(delivery_outbox.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(
        delivery_outbox, "_deliver", lambda _db, d: sent.append(d["id"]) or "ok"
    )
    stats = delivery_outbox.process_delivery_outbox(db=db, batch_size=2)
    assert sent == ["d1"]
    assert stats["sent"] == 1 and stats["deferred"] == 1
    defer = [p for name, p in db.calls if name == "defer_delivery_outbox"]
    assert defer[0]["p_id"] == "d2"


def test_phone_throttle_defers_when_over_limit(monkeypatch):
    monkeypatch.setattr(rate_limit, "consume_rate_limit", lambda *a, **k: (False, 900))
    with pytest.raises(delivery_outbox.DeferDelivery) as exc:
        delivery_outbox._throttle_phone("sms", "08012345678")
    assert exc.value.retry_in == 900


def test_phone_throttle_skips_email_and_fails_open(monkeypatch):
    calls: list[str] = []

    def broken(key, **_k):
        calls.append(key)
        raise RuntimeError("db down")

    monkeypatch.setattr(rate_limit, "consume_rate_limit", broken)
    delivery_outbox._throttle_phone("email", "a@b.co")
    assert calls == []
    delivery_outbox._throttle_phone("sms", "08012345678")
    assert calls == ["outbox-phone:+2348012345678"]


def test_reminder_log_is_written_once_per_outbox_row():
    captured: dict = {}

    class _Table:
        def upsert(self, row, **kwargs):
            captured.update(row=row, kwargs=kwargs)
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    db = SimpleNamespace(table=lambda _name: _Table())
    delivery_outbox._log_reminder(
        db,
        {"id": "d9", "payload": {"reminder_log": {"unit_id": "u1", "kind": "due"}}},
        status="sent",
    )
    assert captured["row"]["outbox_id"] == "d9"
    assert captured["kwargs"] == {"on_conflict": "outbox_id", "ignore_duplicates": True}


def test_migration_048_present():
    sql = (ROOT / "sql" / "048_outbox_defer_and_reminder_once.sql").read_text(encoding="utf-8")
    assert "defer_delivery_outbox" in sql
    assert "greatest(attempt_count - 1, 0)" in sql
    assert "reminders_outbox_id_key" in sql
    assert "to service_role" in sql


# --- Idempotency keys + limits ---------------------------------------------


def test_request_key_parsing():
    assert idempotency.optional_request_key(None) is None
    assert idempotency.optional_request_key("   ") is None
    assert idempotency.optional_request_key(object()) is None
    assert idempotency.optional_request_key(" abc-1234 ") == "abc-1234"
    with pytest.raises(HTTPException) as exc:
        idempotency.optional_request_key("short")
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException):
        idempotency.optional_request_key("has space in it")


def test_consume_rate_limit_reports_retry_after(monkeypatch):
    db = SimpleNamespace(rpc=lambda *_a: _Rpc({"allowed": False, "reset_at": "bad"}))
    monkeypatch.setattr("lib.db.create_service_client", lambda: db)
    assert rate_limit.consume_rate_limit("k", limit=1, window_seconds=60) == (False, 60)


def test_reminder_sends_use_client_key_and_limits():
    from routers import reminders

    send = inspect.getsource(reminders.send_reminder)
    assert "manual-due:{unit_id}:{request_key or uuid.uuid4()}" in send
    assert "_limit_sends(user.id" in send
    retry = inspect.getsource(reminders.retry_reminder)
    assert "uuid.uuid4()}\"" not in retry
    assert retry.count(":{attempt}") == 4
    assert "reminder-bulk:" in inspect.getsource(reminders.send_bulk_reminders)


def test_limit_sends_checks_user_and_unit(monkeypatch):
    from routers import reminders

    keys: list[str] = []
    monkeypatch.setattr(reminders, "enforce_rate_limit", lambda key, **_k: keys.append(key))
    reminders._limit_sends("user-1", "unit-1")
    assert keys == ["reminder-user:user-1", "reminder-unit:unit-1"]


def test_invite_routes_are_capped():
    from routers import artisans, staff, tenancies

    assert "enforce_invite_limit(user.id)" in inspect.getsource(artisans.invite_artisan)
    assert "enforce_invite_limit(user.id)" in inspect.getsource(staff.invite_staff)
    assert "enforce_invite_limit(user.id)" in inspect.getsource(tenancies.invite_tenant)


class _MsgQuery:
    def __init__(self, db):
        self.db = db
        self.filters: dict = {}
        self.op = "select"
        self.row: dict | None = None

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def limit(self, _n):
        return self

    def insert(self, row):
        self.op, self.row = "insert", dict(row)
        return self

    def update(self, _patch):
        self.op = "noop"
        return self

    def upsert(self, _row, **_k):
        self.op = "noop"
        return self

    def execute(self):
        if self.op == "noop":
            return SimpleNamespace(data=[])
        rows = [
            m
            for m in self.db.messages
            if all(m.get(k) == v for k, v in self.filters.items())
        ]
        return SimpleNamespace(data=rows)


class _MsgDb:
    """Fake service client; rpc mirrors sql/050 store_thread_message."""

    def __init__(self, race_winner=None):
        self.messages: list[dict] = []
        self.inserts = 0
        self.race_winner = race_winner
        self.previews: dict[str, str] = {}

    def table(self, _name):
        return _MsgQuery(self)

    def rpc(self, name, params):
        assert name == "store_thread_message"
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=self._store(params)))

    def _store(self, p):
        key = p["p_client_key"]
        if self.race_winner is not None:
            # Another request with this key committed between our check and insert.
            self.messages.append(self.race_winner)
            self.race_winner = None
        prior = next(
            (m for m in self.messages if key and m.get("sender_id") == p["p_sender_id"] and m.get("client_key") == key),
            None,
        )
        if prior:
            if prior["thread_id"] != p["p_thread_id"]:
                return {"outcome": "key_conflict"}
            return {"outcome": "replayed", "message": dict(prior)}
        self.inserts += 1
        row = {
            "id": f"m{len(self.messages) + 1}",
            "thread_id": p["p_thread_id"],
            "sender_id": p["p_sender_id"],
            "body": p["p_body"],
            "client_key": key,
            **(p["p_media"] or {}),
        }
        self.messages.append(row)
        self.previews[p["p_thread_id"]] = p["p_preview"]
        return {"outcome": "created", "message": dict(row)}


def test_chat_send_replay_returns_first_message():
    from routers import messages

    db = _MsgDb()
    thread = {"id": "t1"}
    first, created = messages._store_user_message(db, thread, "u1", "hello", client_key="key-00001")
    again, created_again = messages._store_user_message(
        db, thread, "u1", "hello", client_key="key-00001"
    )
    assert created and not created_again
    assert first["id"] == again["id"]
    assert db.inserts == 1


def test_chat_send_race_on_same_key_returns_winner():
    from routers import messages

    winner = {"id": "m-win", "thread_id": "t1", "sender_id": "u1", "client_key": "key-00001", "body": "hi"}
    db = _MsgDb(race_winner=winner)
    msg, created = messages._store_user_message(db, {"id": "t1"}, "u1", "hi", client_key="key-00001")
    assert not created and msg["id"] == "m-win"


def test_chat_key_reused_in_another_thread_is_409():
    from routers import messages

    db = _MsgDb()
    db.messages.append({"id": "m1", "thread_id": "t-other", "sender_id": "u1", "client_key": "key-00001"})
    with pytest.raises(HTTPException) as exc:
        messages._store_user_message(db, {"id": "t1"}, "u1", "hi", client_key="key-00001")
    assert exc.value.status_code == 409
