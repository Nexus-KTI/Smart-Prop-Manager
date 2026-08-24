"""Smoke-test: signup/login -> create property -> unit -> manual payment."""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client
import httpx

load_dotenv(override=True)

API = os.getenv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:8000").rstrip("/")
URL = os.getenv("SUPABASE_URL")
ANON = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")

email = os.getenv("SMOKE_EMAIL", "smoke.e2e@smartprop.local")
password = os.getenv("SMOKE_PASSWORD", "SmokeTest123!")


def main() -> int:
    if not URL or not ANON:
        print("FAIL: missing SUPABASE_URL / anon key")
        return 1

    sb = create_client(URL, ANON)
    print("signin", email)
    auth = sb.auth.sign_in_with_password({"email": email, "password": password})
    session = auth.session
    if session is None:
        print("FAIL: no session")
        return 1

    token = session.access_token
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=30.0) as client:
        health = client.get(f"{API}/")
        print("health", health.status_code, health.text)

        prop = client.post(
            f"{API}/properties/",
            headers=headers,
            json={"name": "Smoke Court", "address": "Lagos"},
        )
        print("create_property", prop.status_code, prop.text[:300])
        if prop.status_code >= 400:
            return 1
        prop_id = prop.json()[0]["id"]

        unit = client.post(
            f"{API}/properties/{prop_id}/units",
            headers=headers,
            json={
                "label": "Flat 1",
                "rent_amount": 250000,
                "frequency": "monthly",
                "tenant_name": "Test Tenant",
                "tenant_contact": "+2348012345678",
                "due_day": 5,
            },
        )
        print("create_unit", unit.status_code, unit.text[:300])
        if unit.status_code >= 400:
            return 1
        unit_id = unit.json()[0]["id"]

        pay = client.post(
            f"{API}/payments/manual",
            headers=headers,
            json={"unit_id": unit_id, "amount": 250000},
        )
        print("manual_payment", pay.status_code, pay.text[:300])
        if pay.status_code >= 400:
            return 1

        listing = client.get(f"{API}/properties/", headers=headers)
        listing_body = listing.json() if listing.status_code == 200 else {}
        items = listing_body.get("items") if isinstance(listing_body, dict) else None
        print(
            "list_properties",
            listing.status_code,
            "rows",
            len(items or []),
            "next_cursor",
            (listing_body or {}).get("next_cursor") if isinstance(listing_body, dict) else None,
        )
        if listing.status_code != 200 or not isinstance(items, list):
            print("FAIL: properties list should return { items, next_cursor }")
            return 1

        leads = client.get(f"{API}/leads/", headers=headers)
        print("list_leads", leads.status_code, leads.text[:200])
        if leads.status_code != 403:
            print("FAIL: non-admin should get 403 on /leads/")
            return 1

        me = client.get(f"{API}/admin/me", headers=headers)
        print("admin_me", me.status_code, me.text[:200])
        if me.status_code != 200 or me.json().get("is_admin") is not False:
            print("FAIL: smoke user should not be admin")
            return 1

    print("OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
