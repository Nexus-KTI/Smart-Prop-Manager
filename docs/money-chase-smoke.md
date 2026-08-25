# Money / chase reliability — smoke checklist

## Prep
- [ ] API restarted; landlord has preferred channel set (Settings)
- [ ] At least 2 overdue units: one with matching contact, one with wrong/missing contact

## Bulk chase
1. Reminders → select overdue units including a bad-contact unit  
2. **Remind selected**  
3. Toast shows sent/failed/skipped **and** a labeled error (e.g. `Palm · Flat 1: Tenant contact does not match sms channel`)  
4. Failed units stay selected  
5. Open a failed unit’s reminder log → row with **error detail** + **Retry**  

## Landlord money-in email
1. Record manual payment (or Paystack confirm) with profile email + SMTP/Mailgun configured  
2. Unit reminders log shows `landlord_payment` **sent**  
3. Break SMTP / unset email → paid path still succeeds; log shows **failed/skipped** with real reason (not only “Email send failed”)  
4. Re-trigger confirm/webhook after a sent notice → **no second** money-in email (dedupe)

## Receipts
1. Paid row → **Open receipt** opens PDF in a new tab (landlord Payments unit + portfolio list; tenant Receipts)

## Portfolio Payments
1. `/payments` shows money-in for the **active portfolio** (staff with owner switch included)  
2. If any units are overdue → header CTA **N overdue → Chase** → Reminders  
3. Empty money-in with overdue still offers **Chase overdue**

## Automated
- `pytest tests/test_access.py tests/test_bulk_reminders_mismatch.py tests/test_landlord_payment_email.py tests/test_portfolio_money_in.py` — visitor-pass permission live; bulk mismatch logged; landlord email detail; money-in shaping

## Pass criteria
- Channel mismatches are failed+logged, not silent skips  
- Bulk toast surfaces unit label + detail  
- Failed units stay selected (including beyond the first toast errors)  
- Staff with chase permission can bulk / retry / open unit logs for the active portfolio  
- Landlord notice failures are actionable; Paystack re-delivery does not duplicate email  
- Receipt links say Open and open in a new tab  
- Ops overdue: toast on send; empty state has a next action; no-contact units link to Edit  
