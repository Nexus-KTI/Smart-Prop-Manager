"""Applications preview questions, answer caps, list flatten, approve handoff."""

from __future__ import annotations

import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://127.0.0.1:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from routers import applications


def test_preview_question_keys():
    keys = [q["key"] for q in applications.APPLY_QUESTIONS]
    assert keys == ["move_in", "occupation", "guarantor_name", "guarantor_phone"]
    assert "occupants" not in keys


def test_normalize_screening_answers_caps_and_drops_unknown():
    out = applications.normalize_screening_answers(
        {
            "move_in": "  1 Oct  ",
            "occupation": "x" * 200,
            "guarantor_name": "Ada",
            "guarantor_phone": "0801",
            "occupants": "4",
        }
    )
    assert out["move_in"] == "1 Oct"
    assert len(out["occupation"]) == applications.ANSWER_MAX
    assert out["guarantor_name"] == "Ada"
    assert "occupants" not in out


def test_normalize_rejects_non_dict():
    with pytest.raises(HTTPException) as ei:
        applications.normalize_screening_answers(["nope"])
    assert ei.value.status_code == 400


def test_flatten_application_labels_and_rent():
    row = applications.flatten_application(
        {
            "id": "a1",
            "units": {"label": "Flat 2", "rent_amount": 150000},
            "properties": {"name": "Palm Court", "address": "Lekki"},
        }
    )
    assert row["unit_label"] == "Flat 2"
    assert row["property_name"] == "Palm Court"
    assert row["property_address"] == "Lekki"
    assert row["rent_amount"] == 150000
    assert "units" not in row


class _Query:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._op = "select"
        self._payload = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, key, value):
        self._filters.append((key, value))
        return self

    def in_(self, key, values):
        self._filters.append((key, list(values)))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._op == "insert":
            row = {"id": "ten-new", **self._payload}
            self._store.setdefault(self._table, []).append(row)
            return SimpleNamespace(data=[row], count=None)
        rows = list(self._store.get(self._table, []))
        for key, value in self._filters:
            if isinstance(value, list):
                rows = [r for r in rows if r.get(key) in value]
            else:
                rows = [r for r in rows if r.get(key) == value]
        if self._op == "update" and rows:
            rows[0].update(self._payload)
            return SimpleNamespace(data=[dict(rows[0])], count=None)
        return SimpleNamespace(data=rows, count=len(rows))


class _Db:
    """Fake user client; rpc mirrors sql/050 decide_rental_application."""

    def __init__(self, store):
        self._store = store

    def table(self, name):
        return _Query(self._store, name)

    def rpc(self, name, params):
        assert name == "decide_rental_application"
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=self._decide(**params)))

    def _decide(self, p_application_id, p_status):
        app = next(
            (a for a in self._store["rental_applications"] if a["id"] == p_application_id),
            None,
        )
        if app is None:
            return {"outcome": "not_found"}
        if app["status"] not in ("open", "submitted"):
            return {"outcome": "already_decided", "status": app["status"]}
        app.update(status=p_status, decided_at="now")
        if p_status != "approved":
            return {"outcome": "decided", "application": dict(app)}
        contact = (app.get("applicant_phone") or app.get("applicant_email") or "").strip() or None
        name = (app.get("applicant_name") or "").strip() or None
        open_rows = [
            t
            for t in self._store.setdefault("tenancies", [])
            if t["unit_id"] == app["unit_id"]
            and t["status"] in ("draft", "pending_verification", "active")
        ]
        checklist = {
            "checklist_id_collected": True,
            "checklist_agreement_signed": True,
            "checklist_references_checked": True,
        }
        if open_rows:
            t = open_rows[0]
            if contact and not (t.get("tenant_contact") or "").strip():
                t["tenant_contact"] = contact
            if name and not (t.get("tenant_name") or "").strip():
                t["tenant_name"] = name
            t["tenant_user_id"] = t.get("tenant_user_id") or app.get("applicant_user_id")
            t.update(checklist)
        else:
            t = {
                "id": "ten-new",
                "unit_id": app["unit_id"],
                "landlord_id": app["landlord_id"],
                "tenant_user_id": app.get("applicant_user_id"),
                "status": "draft",
                "tenant_name": name,
                "tenant_contact": contact,
                **checklist,
            }
            self._store["tenancies"].append(t)
        return {"outcome": "decided", "application": dict(app), "tenancy_id": t["id"]}


def test_decide_approve_returns_new_tenancy_id():
    store = {
        "rental_applications": [
            {
                "id": "app1",
                "landlord_id": "ll1",
                "unit_id": "u1",
                "status": "submitted",
                "applicant_name": "Tunde",
                "applicant_email": "t@example.com",
                "applicant_phone": "+234800",
                "applicant_user_id": "tu1",
            }
        ],
        "tenancies": [],
    }
    user = SimpleNamespace(id="ll1", db=_Db(store))
    out = applications.decide_application("app1", {"status": "approved"}, user)
    assert out["unit_id"] == "u1"
    assert out["tenancy_id"] == "ten-new"
    assert out["item"]["status"] == "approved"
    assert store["tenancies"][0]["status"] == "draft"
    assert store["tenancies"][0]["tenant_name"] == "Tunde"
    assert store["tenancies"][0]["checklist_id_collected"] is True
    assert store["tenancies"][0]["checklist_agreement_signed"] is True
    assert store["tenancies"][0]["checklist_references_checked"] is True


def test_decide_approve_returns_claim_path(monkeypatch):
    store = {
        "rental_applications": [
            {
                "id": "app1",
                "landlord_id": "ll1",
                "unit_id": "u1",
                "status": "submitted",
                "applicant_name": "Tunde",
                "applicant_email": "t@example.com",
                "applicant_phone": "+234800",
            }
        ],
        "tenancies": [],
    }
    user = SimpleNamespace(id="ll1", db=_Db(store))

    def _invite(_user, tenancy_id, *, notify=True):
        assert tenancy_id == "ten-new"
        assert notify is False
        return {
            "claim_path": "/tenant/claim?token=abc",
            "claim_url": "https://app.example.com/tenant/claim?token=abc",
        }

    monkeypatch.setattr("routers.tenancies.issue_tenancy_claim", _invite)
    out = applications.decide_application("app1", {"status": "approved"}, user)
    assert out["claim_path"] == "/tenant/claim?token=abc"
    assert out["tenancy_id"] == "ten-new"
    assert out.get("claim_error") is None


def test_decide_approve_surfaces_claim_error(monkeypatch):
    from fastapi import HTTPException

    store = {
        "rental_applications": [
            {
                "id": "app1",
                "landlord_id": "ll1",
                "unit_id": "u1",
                "status": "submitted",
                "applicant_name": "Tunde",
                "applicant_email": "t@example.com",
                "applicant_phone": "+234800",
            }
        ],
        "tenancies": [],
    }
    user = SimpleNamespace(id="ll1", db=_Db(store))

    def _invite(_user, _tenancy_id, *, notify=True):
        raise HTTPException(status_code=400, detail="tenant_contact is required before invite")

    monkeypatch.setattr("routers.tenancies.issue_tenancy_claim", _invite)
    out = applications.decide_application("app1", {"status": "approved"}, user)
    assert out["claim_path"] is None
    assert "tenant_contact" in str(out["claim_error"])


def test_decide_approve_syncs_contact_on_existing_tenancy(monkeypatch):
    store = {
        "rental_applications": [
            {
                "id": "app1",
                "landlord_id": "ll1",
                "unit_id": "u1",
                "status": "submitted",
                "applicant_name": "Tunde",
                "applicant_email": "t@example.com",
                "applicant_phone": "+234800",
            }
        ],
        "tenancies": [
            {
                "id": "ten-old",
                "unit_id": "u1",
                "status": "draft",
                "tenant_contact": None,
                "tenant_name": None,
            }
        ],
    }
    user = SimpleNamespace(id="ll1", db=_Db(store))

    def _invite(_user, tenancy_id, *, notify=True):
        assert tenancy_id == "ten-old"
        assert store["tenancies"][0]["tenant_contact"] == "+234800"
        return {
            "claim_path": "/tenant/claim?token=xyz",
            "claim_url": "https://app.example.com/tenant/claim?token=xyz",
        }

    monkeypatch.setattr("routers.tenancies.issue_tenancy_claim", _invite)
    out = applications.decide_application("app1", {"status": "approved"}, user)
    assert out["claim_path"] == "/tenant/claim?token=xyz"
    assert store["tenancies"][0]["checklist_references_checked"] is True


def test_decide_lost_race_is_already_decided():
    store = {
        "rental_applications": [
            {"id": "app1", "landlord_id": "ll1", "unit_id": "u1", "status": "submitted"}
        ],
        "tenancies": [],
    }
    db = _Db(store)
    user = SimpleNamespace(id="ll1", db=db)
    real = db._decide

    def decided_elsewhere(**params):
        store["rental_applications"][0]["status"] = "rejected"
        return real(**params)

    db._decide = decided_elsewhere  # type: ignore[method-assign]
    with pytest.raises(HTTPException) as ei:
        applications.decide_application("app1", {"status": "approved"}, user)
    assert ei.value.status_code == 400
    assert store["tenancies"] == []


def test_migration_050_locks_and_scopes_decide():
    from pathlib import Path

    sql = (
        Path(__file__).resolve().parents[1]
        / "sql"
        / "050_atomic_claims_decide_and_messages.sql"
    ).read_text(encoding="utf-8")
    assert "landlord_id = auth.uid()" in sql
    assert "pg_advisory_xact_lock(hashtext('tenancy-open-unit:'" in sql
    assert "security invoker" in sql
    for fn in ("claim_tenancy_invite", "claim_artisan_invite", "store_thread_message"):
        assert f"grant execute on function public.{fn}(" in sql
    assert sql.count("to service_role;") >= 3
