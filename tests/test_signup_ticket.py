"""Signup invite HMAC tickets."""

from __future__ import annotations

import time

from lib.signup_ticket import issue_signup_ticket, verify_signup_ticket


def test_signup_ticket_roundtrip(monkeypatch):
    monkeypatch.setenv("SIGNUP_TICKET_SECRET", "unit-test-secret")
    invite = "11111111-2222-4333-8444-555555555555"
    ticket = issue_signup_ticket(invite, ttl_seconds=120)
    assert ticket
    assert verify_signup_ticket(invite, ticket)
    assert not verify_signup_ticket(invite, "0.deadbeef")
    assert not verify_signup_ticket("other-id", ticket)


def test_signup_ticket_expires(monkeypatch):
    monkeypatch.setenv("SIGNUP_TICKET_SECRET", "unit-test-secret")
    invite = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    ticket = issue_signup_ticket(invite, ttl_seconds=60)
    assert ticket
    exp_s, sig = ticket.split(".", 1)
    stale = f"{int(exp_s) - 3600}.{sig}"
    assert not verify_signup_ticket(invite, stale)
    # Fresh ticket still ok
    assert verify_signup_ticket(invite, ticket)
    _ = time.time  # keep import used for clarity
