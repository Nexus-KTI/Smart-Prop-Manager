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
    def __init__(self, store):
        self._store = store

    def table(self, name):
        return _Query(self._store, name)


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

    def _invite(tenancy_id, _user):
        assert tenancy_id == "ten-new"
        return {
            "claim_path": "/tenant/claim?token=abc",
            "claim_url": "https://app.example.com/tenant/claim?token=abc",
        }

    monkeypatch.setattr("routers.tenancies.invite_tenant", _invite)
    out = applications.decide_application("app1", {"status": "approved"}, user)
    assert out["claim_path"] == "/tenant/claim?token=abc"
    assert out["tenancy_id"] == "ten-new"
