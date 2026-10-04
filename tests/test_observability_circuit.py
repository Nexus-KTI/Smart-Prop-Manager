"""Request IDs, structured logs, and provider circuit breakers."""

from __future__ import annotations

import json
import logging
import os

import httpx
import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from lib import circuit, observability  # noqa: E402


class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def _breaker(clock=None):
    return circuit.CircuitBreaker(
        "Test", failure_threshold=3, reset_after=30.0, clock=clock or _Clock()
    )


def _boom():
    raise httpx.ConnectError("down")


def test_breaker_opens_after_consecutive_failures_and_fails_fast():
    breaker = _breaker()
    calls = []

    def flaky():
        calls.append(1)
        _boom()

    for _ in range(3):
        with pytest.raises(httpx.ConnectError):
            breaker.call(flaky, is_failure=circuit.is_http_provider_failure)
    with pytest.raises(circuit.CircuitOpenError) as exc:
        breaker.call(flaky, is_failure=circuit.is_http_provider_failure)
    assert len(calls) == 3
    assert "temporarily unavailable" in str(exc.value)


def test_breaker_lets_one_trial_through_then_closes_on_success():
    clock = _Clock()
    breaker = _breaker(clock)
    for _ in range(3):
        with pytest.raises(httpx.ConnectError):
            breaker.call(_boom, is_failure=circuit.is_http_provider_failure)
    clock.now += 31
    assert breaker.state == "half_open"
    assert breaker.call(lambda: "ok", is_failure=circuit.is_http_provider_failure) == "ok"
    assert breaker.state == "closed"


def test_failed_trial_reopens_immediately():
    clock = _Clock()
    breaker = _breaker(clock)
    for _ in range(3):
        with pytest.raises(httpx.ConnectError):
            breaker.call(_boom, is_failure=circuit.is_http_provider_failure)
    clock.now += 31
    with pytest.raises(httpx.ConnectError):
        breaker.call(_boom, is_failure=circuit.is_http_provider_failure)
    assert breaker.state == "open"


def test_provider_4xx_never_trips_the_breaker():
    breaker = _breaker()

    def bad_number():
        raise RuntimeError("invalid phone number")

    for _ in range(10):
        with pytest.raises(RuntimeError):
            breaker.call(bad_number, is_failure=circuit.is_http_provider_failure)
    assert breaker.state == "closed"


def test_mailgun_503s_open_the_breaker(monkeypatch):
    from lib import notify

    breaker = circuit.CircuitBreaker("Mailgun", failure_threshold=5, clock=_Clock())
    monkeypatch.setattr(notify, "mailgun_breaker", breaker)
    monkeypatch.setenv("MAILGUN_API_KEY", "k")
    monkeypatch.setenv("MAILGUN_DOMAIN", "example.com")
    monkeypatch.setenv("MAILGUN_SENDER_EMAIL", "noreply@example.com")
    posts = []

    class _Resp:
        status_code = 503
        text = "unavailable"

    class _Client:
        def post(self, *_a, **_k):
            posts.append(1)
            return _Resp()

    monkeypatch.setattr(notify, "get_http_client", lambda: _Client())
    for _ in range(5):
        with pytest.raises(circuit.ProviderServerError):
            notify._send_email_mailgun("a@b.co", "hi", subject="s")
    with pytest.raises(circuit.CircuitOpenError):
        notify._send_email_mailgun("a@b.co", "hi", subject="s")
    assert len(posts) == 5


def test_open_breaker_is_a_retryable_outbox_failure():
    from lib.delivery_outbox import _is_permanent_failure

    assert not _is_permanent_failure(circuit.CircuitOpenError("Twilio", 12))


def test_twilio_outage_classification():
    import requests
    from twilio.base.exceptions import TwilioRestException

    from lib.notify import _is_twilio_outage

    assert _is_twilio_outage(requests.exceptions.ConnectTimeout())
    assert _is_twilio_outage(TwilioRestException(503, "https://api.twilio.com"))
    assert not _is_twilio_outage(TwilioRestException(400, "https://api.twilio.com"))
    assert not _is_twilio_outage(TwilioRestException(429, "https://api.twilio.com"))


def test_open_paystack_breaker_refuses_before_charging(monkeypatch):
    from lib import paystack

    breaker = circuit.CircuitBreaker("Paystack", failure_threshold=1, clock=_Clock())
    breaker.record_failure()
    monkeypatch.setattr(paystack, "paystack_breaker", breaker)
    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test")

    def no_http():
        raise AssertionError("Paystack must not be called while the breaker is open")

    monkeypatch.setattr(paystack, "get_http_client", no_http)
    with pytest.raises(HTTPException) as exc:
        paystack.charge_authorization(
            email="t@x.co",
            amount_kobo=500000,
            authorization_code="AUTH_x",
            reference="nexora_sc_abcdef123456",
        )
    assert exc.value.status_code == 503


def test_request_id_accepts_safe_tokens_only():
    assert observability.accept_request_id("abc12345-XYZ.req") == "abc12345-XYZ.req"
    minted = observability.accept_request_id("bad id\nInjected: 1")
    assert minted != "bad id\nInjected: 1" and len(minted) == 32
    assert len(observability.accept_request_id(None)) == 32


def test_responses_carry_request_ids_and_logs_include_them():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    seen: list[str | None] = []

    @app.get("/ping")
    def ping():
        seen.append(observability.current_request_id())
        logging.getLogger("routers.test").info("inside")
        return {"ok": True}

    app.add_middleware(observability.RequestIdMiddleware)
    client = TestClient(app)
    first = client.get("/ping").headers["x-request-id"]
    second = client.get("/ping").headers["x-request-id"]
    echoed = client.get("/ping", headers={"X-Request-ID": "caller-req-0001"})
    assert first != second
    assert echoed.headers["x-request-id"] == "caller-req-0001"
    assert seen == [first, second, "caller-req-0001"]
    assert observability.current_request_id() is None


def test_json_formatter_includes_request_id_and_extras():
    record = logging.makeLogRecord(
        {"name": "nexora.access", "levelname": "INFO", "msg": "GET /x 200",
         "status": 200, "path": "/x"}
    )
    observability.RequestIdFilter().filter(record)
    line = json.loads(observability.JsonFormatter().format(record))
    assert line["msg"] == "GET /x 200"
    assert line["status"] == 200 and line["path"] == "/x"
    assert line["request_id"] == "-"
