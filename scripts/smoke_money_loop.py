"""Procedural smoke: landlord invite → tenant claim → activate → manual pay.

Bypasses Supabase Auth captcha via admin generate_link + verify_otp.
Requires SUPABASE_URL, anon key, and SUPABASE_SERVICE_ROLE_KEY in .env.
"""

from __future__ import annotations

import os
import sys
import time
import uuid

import httpx
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(override=True)

API = os.getenv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8000").rstrip("/")
URL = os.getenv("SUPABASE_URL")
ANON = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
SERVICE = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

STAMP = uuid.uuid4().hex[:8]
LANDLORD_EMAIL = os.getenv("SMOKE_LL_EMAIL", f"smoke.ll.{STAMP}@smartprop.local")
TENANT_EMAIL = os.getenv("SMOKE_TN_EMAIL", f"smoke.tn.{STAMP}@smartprop.local")
PASSWORD = os.getenv("SMOKE_PASSWORD", "SmokeTest123!")


def _fail(msg: str) -> int:
    print(f"FAIL: {msg}")
    return 1


def _session_for(email: str) -> str:
    """Create/confirm user with service role, return access_token (no captcha)."""
    admin = create_client(URL, SERVICE)
    try:
        admin.auth.admin.create_user(
            {
                "email": email,
                "password": PASSWORD,
                "email_confirm": True,
            }
        )
    except Exception as exc:
        if "already" not in str(exc).lower() and "registered" not in str(exc).lower():
            print(f"note create_user {email}: {exc}")

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            link = admin.auth.admin.generate_link({"type": "magiclink", "email": email})
            props = getattr(link, "properties", None) or {}
            if isinstance(props, dict):
                hashed = props.get("hashed_token")
            else:
                hashed = getattr(props, "hashed_token", None)
            if not hashed and hasattr(link, "model_dump"):
                raw = link.model_dump()
                hashed = (raw.get("properties") or {}).get("hashed_token")
            if not hashed:
                raise RuntimeError(f"no hashed_token for {email}: {link!r}")

            anon = create_client(URL, ANON)
            verified = anon.auth.verify_otp({"type": "email", "token_hash": hashed})
            if not verified.session or not verified.session.access_token:
                raise RuntimeError(f"verify_otp failed for {email}")
            return verified.session.access_token
        except Exception as exc:
            last_err = exc
            print(f"session attempt {attempt} failed: {exc}")
            time.sleep(1.2 * attempt)
    raise RuntimeError(f"could not mint session for {email}: {last_err}")


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main() -> int:
    if not URL or not ANON or not SERVICE:
        return _fail("need SUPABASE_URL, anon key, SUPABASE_SERVICE_ROLE_KEY")

    print("0 health", API)
    with httpx.Client(timeout=45.0) as client:
        health = client.get(f"{API}/health")
        print("health", health.status_code, health.text[:120])
        if health.status_code != 200:
            return _fail("API health")

        print("1 mint landlord session", LANDLORD_EMAIL)
        ll_token = _session_for(LANDLORD_EMAIL)
        ll = _headers(ll_token)

        print("2 create property + unit")
        prop = client.post(
            f"{API}/properties/",
            headers=ll,
            json={"name": f"Smoke Money {STAMP}", "address": "Lagos"},
        )
        print("property", prop.status_code, prop.text[:800])
        if prop.status_code >= 400:
            return _fail("property")
        prop_body = prop.json()
        prop_id = prop_body[0]["id"] if isinstance(prop_body, list) else prop_body["id"]

        unit = client.post(
            f"{API}/properties/{prop_id}/units",
            headers=ll,
            json={
                "label": f"Flat {STAMP}",
                "rent_amount": 250000,
                "frequency": "monthly",
                "tenant_name": "Smoke Tenant",
                "tenant_contact": TENANT_EMAIL,
                "due_day": 5,
            },
        )
        print("unit", unit.status_code, unit.text[:200])
        if unit.status_code >= 400:
            return _fail("unit")
        unit_body = unit.json()
        unit_id = unit_body[0]["id"] if isinstance(unit_body, list) else unit_body["id"]

        print("3 start tenancy")
        ten = client.post(f"{API}/tenancies/unit/{unit_id}", headers=ll, json={})
        print("tenancy", ten.status_code, ten.text[:300])
        if ten.status_code >= 400:
            return _fail("tenancy create")
        tenancy = ten.json()["tenancy"]
        tenancy_id = tenancy["id"]

        print("4 tick required checklist via API")
        chk = client.patch(
            f"{API}/tenancies/{tenancy_id}/checklist",
            headers=ll,
            json={
                "checklist_id_collected": True,
                "checklist_agreement_signed": True,
                "checklist_references_checked": True,
            },
        )
        print("checklist", chk.status_code, chk.text[:200])
        if chk.status_code >= 400:
            return _fail("checklist")

        print("5 invite / claim path")
        inv = client.post(f"{API}/tenancies/{tenancy_id}/invite", headers=ll)
        print("invite", inv.status_code, inv.text[:400])
        if inv.status_code >= 400:
            return _fail("invite")
        inv_body = inv.json()
        claim_path = inv_body.get("claim_path")
        token = inv_body.get("invite_token")
        if not claim_path or not token:
            return _fail(f"missing claim_path/token: {inv_body}")
        print("claim_path", claim_path)

        print("6 tenant session + claim")
        tn_token = _session_for(TENANT_EMAIL)
        tn = _headers(tn_token)
        claim = client.post(
            f"{API}/tenancies/claim",
            headers=tn,
            json={"token": token},
        )
        print("claim", claim.status_code, claim.text[:300])
        if claim.status_code >= 400:
            return _fail("claim")

        print("7 activate occupancy")
        act = client.post(f"{API}/tenancies/{tenancy_id}/activate", headers=ll)
        print("activate", act.status_code, act.text[:300])
        if act.status_code >= 400:
            return _fail("activate")
        status = (act.json().get("tenancy") or {}).get("status")
        if status != "active":
            return _fail(f"expected active, got {status}")

        print("8 landlord manual payment")
        pay = client.post(
            f"{API}/payments/manual",
            headers={
                **ll,
                "Idempotency-Key": f"smoke-money-{STAMP}",
            },
            json={"unit_id": unit_id, "amount": 250000},
        )
        print("manual_pay", pay.status_code, pay.text[:300])
        if pay.status_code >= 400:
            return _fail("manual pay")

        print("PASS money loop", {"unit_id": unit_id, "tenancy_id": tenancy_id})
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: exception {exc}")
        raise
