"""Check Twilio SMS readiness for Nexora (account, sender, optional test send).

Usage:
  python scripts/check_twilio.py
  python scripts/check_twilio.py --to +2347XXXXXXXXX
"""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv


def main() -> int:
    load_dotenv(override=True)
    parser = argparse.ArgumentParser(description="Twilio SMS ops check")
    parser.add_argument(
        "--to",
        help="Optional E.164 number to send a test SMS (Trial: must be verified)",
    )
    args = parser.parse_args()

    sid = (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
    token = (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
    sms_from = (os.getenv("TWILIO_SMS_FROM") or os.getenv("TWILIO_FROM") or "").strip()
    wa_from = (os.getenv("TWILIO_WHATSAPP_FROM") or "").strip()

    print("TWILIO_ACCOUNT_SID", "ok" if sid.startswith("AC") else "MISSING/invalid")
    print("TWILIO_AUTH_TOKEN", "ok" if len(token) >= 16 else "MISSING/short")
    print("TWILIO_SMS_FROM", sms_from or "MISSING")
    print(
        "TWILIO_WHATSAPP_FROM",
        wa_from or "(unset â€” SMS is default channel)",
    )

    if not sid or not token:
        print("FAIL: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env")
        return 1
    if not sms_from:
        print("FAIL: set TWILIO_SMS_FROM (+E.164 or Messaging Service SID MGâ€¦)")
        return 1

    try:
        from twilio.rest import Client
    except ImportError:
        print("FAIL: pip install twilio")
        return 1

    client = Client(sid, token)
    try:
        account = client.api.accounts(sid).fetch()
        print("account_status", account.status, "type", getattr(account, "type", "?"))
    except Exception as exc:
        print("FAIL: cannot fetch account:", exc)
        return 1

    if sms_from.startswith("MG"):
        try:
            svc = client.messaging.v1.services(sms_from).fetch()
            nums = list(
                client.messaging.v1.services(sms_from).phone_numbers.list(limit=10)
            )
            print("messaging_service", svc.friendly_name, "senders", len(nums))
            for n in nums:
                print("  sender", n.phone_number)
        except Exception as exc:
            print("WARN: messaging service check failed:", exc)
    else:
        print("sms_from_mode", "phone_number")

    if wa_from and "14155238886" in wa_from.replace(" ", ""):
        print(
            "WARN: TWILIO_WHATSAPP_FROM looks like the sandbox â€” "
            "keep Settings channel on SMS until you have a production WA sender"
        )

    print("recent_messages:")
    try:
        for m in client.messages.list(limit=5):
            print(
                " ",
                m.date_created,
                m.status,
                m.from_,
                "->",
                m.to,
                "err",
                m.error_code,
                (m.error_message or "")[:80],
            )
    except Exception as exc:
        print("  (could not list:", exc, ")")

    if args.to:
        try:
            msg = client.messages.create(
                from_=sms_from,
                to=args.to.strip(),
                body="Nexora SMS check â€” Twilio is configured.",
            )
            print("test_send", msg.sid, msg.status)
        except Exception as exc:
            print("FAIL: test send:", exc)
            print(
                "Tip: Trial accounts can only SMS verified numbers; "
                "upgrade or verify the To number in Twilio."
            )
            return 1

    print("OK: Twilio credentials look usable for SMS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
