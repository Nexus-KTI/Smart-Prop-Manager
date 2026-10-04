"""Local dev may run Next.js on any localhost port; Render stays allow-list only."""

from __future__ import annotations

import os
import re

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service")

from main import _cors_origin_regex  # noqa: E402


def test_local_regex_allows_any_localhost_port(monkeypatch) -> None:
    monkeypatch.delenv("RENDER", raising=False)
    pattern = _cors_origin_regex()
    assert pattern is not None
    for origin in (
        "http://localhost:4010",
        "http://127.0.0.1:3001",
        "http://localhost",
    ):
        assert re.fullmatch(pattern, origin)
    for origin in (
        "https://localhost:4010",
        "http://localhost.evil.com",
        "http://evil.com/localhost:3000",
        "http://192.168.1.5:3000",
    ):
        assert not re.fullmatch(pattern, origin)


def test_supabase_timeout_is_503_and_still_allows_localhost(monkeypatch) -> None:
    import httpx
    from fastapi.testclient import TestClient

    from main import app

    monkeypatch.delenv("RENDER", raising=False)

    @app.get("/__transport_probe")
    def probe():
        raise httpx.ConnectTimeout("timed out")

    client = TestClient(app, raise_server_exceptions=False)
    res = client.get(
        "/__transport_probe",
        headers={"Origin": "http://localhost:4010"},
    )
    assert res.status_code == 503
    assert res.headers["access-control-allow-origin"] == "http://localhost:4010"
    assert "account service" in res.json()["detail"]


def test_render_disables_localhost_regex(monkeypatch) -> None:
    monkeypatch.setenv("RENDER", "true")
    assert _cors_origin_regex() is None
