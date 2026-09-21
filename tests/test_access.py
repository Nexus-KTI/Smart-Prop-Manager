"""Phase 4 access control + audit (permission boundaries)."""

from __future__ import annotations

import pytest

from lib.access import (
    PERM_ACCESS_VISITOR_PASSES,
    PERM_MONEY,
    PERM_TEAM_INVITE,
    AccessContext,
    context_from_membership,
    defaults_for_role,
    permissions_from_membership,
)
from lib.audit import record_audit


def test_role_defaults_caretaker_cannot_full_money_or_team():
    d = defaults_for_role("caretaker")
    assert d["money"] is False
    assert d["money_log_cash"] is True
    assert d["chase"] is True
    assert d["team_invite"] is False
    assert d["access_visitor_passes"] is True  # schema slot


def test_role_defaults_manager_has_grants():
    d = defaults_for_role("manager")
    assert d["money"] is True
    assert d["chase"] is True
    assert d["team_invite"] is True


def test_visitor_pass_permission_enforced_at_runtime():
    """Phase 5: caretakers with the flag can issue visitor passes."""
    ctx = AccessContext(
        user_id="S1",
        owner_id="O1",
        role="caretaker",
        membership_id="M1",
        permissions={PERM_ACCESS_VISITOR_PASSES, "chase"},
    )
    assert ctx.has(PERM_ACCESS_VISITOR_PASSES) is True
    assert ctx.has("chase") is True
    denied = AccessContext(
        user_id="S2",
        owner_id="O1",
        role="caretaker",
        membership_id="M2",
        permissions={"chase"},
    )
    assert denied.has(PERM_ACCESS_VISITOR_PASSES) is False


def test_owner_has_all_permissions():
    ctx = AccessContext(
        user_id="O1",
        owner_id="O1",
        role="owner",
        permissions=set(),
    )
    assert ctx.has(PERM_MONEY) is True
    assert ctx.has(PERM_TEAM_INVITE) is True


def test_manager_scoped_membership_permissions():
    row = {
        "id": "M1",
        "owner_id": "OA",
        "role": "manager",
        "can_money": True,
        "can_money_log_cash": True,
        "can_chase": True,
        "can_docs_view": True,
        "can_docs_upload": True,
        "can_access_visitor_passes": True,
        "can_team_invite": True,
        "scope_all_properties": True,
    }
    perms = permissions_from_membership(row)
    assert PERM_MONEY in perms
    ctx = context_from_membership("S1", row)
    assert ctx.owner_id == "OA"
    assert ctx.role == "manager"
    assert ctx.has(PERM_MONEY) is True


def test_caretaker_without_money_fails_require():
    ctx = AccessContext(
        user_id="S1",
        owner_id="OA",
        role="caretaker",
        membership_id="M1",
        permissions={"money_log_cash", "chase"},
    )
    assert ctx.has(PERM_MONEY) is False
    assert ctx.has("money_log_cash") is True
    try:
        ctx.require(PERM_MONEY)
        assert False, "expected 403"
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 403


def test_audit_skips_owner_actions(monkeypatch):
    calls: list[dict] = []

    class _FakeTable:
        def insert(self, row):
            calls.append(row)
            return self

        def execute(self):
            return type("R", (), {"data": []})()

    class _FakeDb:
        def table(self, _name):
            return _FakeTable()

    monkeypatch.setattr("lib.db.create_service_client", lambda: _FakeDb())

    owner_ctx = AccessContext(
        user_id="O1", owner_id="O1", role="owner", permissions=set()
    )
    record_audit(owner_ctx, action="payment.manual", target_type="unit", target_id="U1")
    assert calls == []

    staff_ctx = AccessContext(
        user_id="S1",
        owner_id="O1",
        role="caretaker",
        membership_id="M1",
        permissions={"money_log_cash"},
    )
    record_audit(
        staff_ctx, action="payment.manual", target_type="unit", target_id="U1"
    )
    assert len(calls) == 1
    assert calls[0]["actor_user_id"] == "S1"
    assert calls[0]["owner_id"] == "O1"


def test_staff_visitor_pass_stub_retired(monkeypatch):
    """Legacy POST /staff/access/visitor-pass must not claim Phase 5 501."""
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:54321")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

    from fastapi import HTTPException

    from routers.staff import visitor_pass_deprecated

    class _User:
        id = "u1"

    with pytest.raises(HTTPException) as ei:
        visitor_pass_deprecated(_User())  # type: ignore[arg-type]
    assert ei.value.status_code == 410
    assert "/access/passes" in str(ei.value.detail)
