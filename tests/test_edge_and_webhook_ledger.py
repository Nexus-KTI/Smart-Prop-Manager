"""API edge headers/host allowlist and the Paystack webhook event ledger."""

from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from lib import edge  # noqa: E402
from routers import payments  # noqa: E402


# --- edge ----------------------------------------------------------------------


def _app(**host_kw) -> FastAPI:
    app = FastAPI()

    @app.get("/thing")
    def thing():
        return {"ok": True, "pad": "x" * 2000}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    from starlette.middleware.gzip import GZipMiddleware

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(edge.SecurityHeadersMiddleware, hsts=True)
    app.add_middleware(edge.TrustedHostMiddleware, **host_kw)
    return app


def test_security_headers_on_api_responses():
    res = TestClient(_app(allowed=[])).get("/thing")
    assert res.status_code == 200
    h = res.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in h["content-security-policy"]
    assert h["strict-transport-security"].startswith("max-age=")


def test_docs_paths_skip_the_strict_csp():
    res = TestClient(_app(allowed=[])).get("/docs")
    assert res.status_code == 200
    assert "content-security-policy" not in res.headers
    assert res.headers["x-content-type-options"] == "nosniff"


def test_large_json_is_gzipped():
    res = TestClient(_app(allowed=[])).get("/thing", headers={"Accept-Encoding": "gzip"})
    assert res.headers.get("content-encoding") == "gzip"
    assert res.json()["ok"] is True


def test_trusted_host_enforced_only_when_configured():
    open_client = TestClient(_app(allowed=[]), base_url="http://evil.example")
    assert open_client.get("/thing").status_code == 200

    app = _app(allowed=["api.nexora.test", "*.onrender.com"])
    assert TestClient(app, base_url="http://api.nexora.test").get("/thing").status_code == 200
    assert TestClient(app, base_url="http://x.onrender.com:443").get("/thing").status_code == 200
    bad = TestClient(app, base_url="http://evil.example")
    assert bad.get("/thing").status_code == 400
    assert bad.get("/health").status_code == 200


def test_allowed_hosts_env(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOSTS", " API.Nexora.test , *.onrender.com ,")
    assert edge.allowed_hosts_from_env() == ["api.nexora.test", "*.onrender.com"]
    monkeypatch.delenv("ALLOWED_HOSTS")
    assert edge.allowed_hosts_from_env() == []
    assert edge.host_allowed("[::1]:8000", ["[::1]"])
    assert not edge.host_allowed("onrender.com.evil.test", ["*.onrender.com"])


def test_main_wires_edge_middleware_in_order():
    src = (Path(__file__).resolve().parents[1] / "main.py").read_text(encoding="utf-8")
    order = [
        src.index("app.add_middleware(GZipMiddleware"),
        src.index("app.add_middleware(SecurityHeadersMiddleware)"),
        src.index("app.add_middleware(TrustedHostMiddleware)"),
        src.index("app.add_middleware(RequestIdMiddleware)"),
    ]
    assert order == sorted(order)


# --- webhook ledger --------------------------------------------------------------


class _Q:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.op, self.payload = db, table, {}, "select", None

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def upsert(self, row, **kw):
        self.op, self.payload = "upsert", row
        return self

    def update(self, patch):
        self.op, self.payload = "update", patch
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def in_(self, col, vals):
        self.filters[col] = tuple(vals)
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self.db.run(self)})()


class _LedgerDb:
    def __init__(self, txns=None):
        self.events: dict[str, dict] = {}
        self.txns = {t["id"]: dict(t) for t in (txns or [])}
        self.updates = []

    def table(self, name):
        return _Q(self, name)

    def run(self, q):
        if q.table == "paystack_events":
            key = q.filters.get("event_key") or (q.payload or {}).get("event_key")
            if q.op == "upsert":
                if key in self.events:
                    return []
                self.events[key] = {**q.payload, "processed_at": None}
                return [self.events[key]]
            if q.op == "update":
                self.events[key].update(q.payload)
                return [self.events[key]]
            row = self.events.get(key)
            return [row] if row else []
        if q.table == "transactions":
            if q.op == "update":
                self.updates.append((q.filters.get("id"), dict(q.payload)))
                txn = self.txns[q.filters["id"]]
                txn.update(q.payload)
                return [txn]
            ref = q.filters.get("payment_reference")
            rows = [t for t in self.txns.values() if ref and t.get("payment_reference") == ref]
            if "id" in q.filters:
                rows = [t for t in self.txns.values() if t["id"] == q.filters["id"]]
            return rows[:1]
        raise AssertionError(q.table)


KEY = "a" * 64


def _run(db, monkeypatch, event, key=KEY):
    monkeypatch.setattr(payments, "create_service_client", lambda: db)
    return payments._apply_paystack_event(event, key)


def test_replayed_delivery_is_acknowledged_without_rerunning(monkeypatch):
    db = _LedgerDb()
    calls = []
    monkeypatch.setattr(payments, "_paystack_handler", lambda name: lambda *a: calls.append(name) or ("ignored", None))
    event = {"event": "charge.success", "data": {"reference": "ref-1"}}
    assert _run(db, monkeypatch, event) == {"status": "ok"}
    assert _run(db, monkeypatch, event) == {"status": "ok", "replayed": True}
    assert calls == ["charge.success"]
    assert db.events[KEY]["reference"] == "ref-1"
    assert db.events[KEY]["processed_at"]


def test_failed_processing_is_retried(monkeypatch):
    db = _LedgerDb()
    attempts = []

    def flaky(*_a):
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("db blip")
        return "ignored", None

    monkeypatch.setattr(payments, "_paystack_handler", lambda name: flaky)
    event = {"event": "charge.success", "data": {"reference": "ref-2"}}
    try:
        _run(db, monkeypatch, event)
    except RuntimeError:
        pass
    assert db.events[KEY]["processed_at"] is None
    assert _run(db, monkeypatch, event) == {"status": "ok"}
    assert len(attempts) == 2


def test_unknown_event_is_recorded_as_ignored(monkeypatch):
    db = _LedgerDb()
    _run(db, monkeypatch, {"event": "transfer.success", "data": {"reference": "t-1"}})
    assert db.events[KEY]["outcome"] == "ignored"


def test_refund_processed_accumulates_and_alerts(monkeypatch, caplog):
    db = _LedgerDb([{"id": "txn-1", "payment_reference": "PS-1", "status": "paid", "refunded_amount": "50"}])
    event = {
        "event": "refund.processed",
        "data": {"status": "processed", "transaction_reference": "PS-1", "amount": "10000"},
    }
    _run(db, monkeypatch, event)
    txn = db.txns["txn-1"]
    assert txn["refunded_amount"] == "150"
    assert txn["refunded_at"]
    assert txn["status"] == "paid"
    assert db.events[KEY]["outcome"] == "refund_processed"
    assert db.events[KEY]["transaction_id"] == "txn-1"
    assert any(r.levelname == "ERROR" and "refund processed" in r.getMessage() for r in caplog.records)


def test_refund_pending_records_without_touching_the_transaction(monkeypatch):
    db = _LedgerDb([{"id": "txn-1", "payment_reference": "PS-1", "status": "paid"}])
    _run(db, monkeypatch, {"event": "refund.pending", "data": {"transaction_reference": "PS-1", "amount": "100"}})
    assert db.updates == []
    assert db.events[KEY]["outcome"] == "refund_pending"


def test_unmatched_refund_is_logged(monkeypatch):
    db = _LedgerDb()
    _run(db, monkeypatch, {"event": "refund.processed", "data": {"transaction_reference": "nope"}})
    assert db.events[KEY]["outcome"] == "refund_processed_unmatched"


def test_dispute_lifecycle(monkeypatch):
    db = _LedgerDb([{"id": "txn-1", "payment_reference": "PS-1", "status": "paid"}])
    _run(
        db,
        monkeypatch,
        {"event": "charge.dispute.create", "data": {"status": "awaiting-merchant-feedback", "transaction": {"reference": "PS-1"}}},
        key="b" * 64,
    )
    txn = db.txns["txn-1"]
    first_seen = txn["disputed_at"]
    assert first_seen and txn["dispute_status"] == "awaiting-merchant-feedback"

    _run(
        db,
        monkeypatch,
        {"event": "charge.dispute.resolve", "data": {"status": "resolved", "resolution": "merchant-accepted", "transaction": {"reference": "PS-1"}}},
        key="c" * 64,
    )
    assert txn["dispute_status"] == "merchant-accepted"
    assert txn["disputed_at"] == first_seen
    assert txn["status"] == "paid"


def test_charge_success_marks_paid_and_reports_outcome(monkeypatch):
    db = _LedgerDb([{"id": "txn-1", "payment_reference": "PS-9", "status": "pending", "amount": 1000, "unit_id": "u1"}])
    queued = []
    monkeypatch.setattr(payments, "_validate_paystack_binding", lambda *a, **k: None)
    monkeypatch.setattr(payments, "_queue_paid_side_effects", lambda db, txn: queued.append(txn["id"]))
    _run(db, monkeypatch, {"event": "charge.success", "data": {"reference": "PS-9", "metadata": {"transaction_id": "txn-1"}}})
    assert db.txns["txn-1"]["status"] == "paid"
    assert queued == ["txn-1"]
    assert db.events[KEY]["outcome"] == "paid"


def test_webhook_keys_on_body_hash():
    import inspect

    src = inspect.getsource(payments.paystack_webhook)
    assert "hashlib.sha256(body).hexdigest()" in src
    assert "run_in_threadpool(_apply_paystack_event" in src


def test_migration_053_ledger_is_service_role_only():
    sql = (Path(__file__).resolve().parents[1] / "sql" / "053_paystack_event_ledger.sql").read_text(encoding="utf-8")
    assert "event_key text not null unique" in sql
    assert "revoke all on table public.paystack_events from public, anon, authenticated" in sql
    assert "enable row level security" in sql
    for col in ("refunded_amount", "refunded_at", "disputed_at", "dispute_status"):
        assert col in sql
