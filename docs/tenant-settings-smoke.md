# Nexora tenant slice smoke (procedural)

**Date:** 2026-08-27  
**Scope:** Wiring + auth-gate checks for recently shipped tenant gaps (not full headed login).

## Environment

| Check | Result |
|-------|--------|
| API `GET /health` `:8001` | `{"status":"ok"}` |
| Web `:3000` | HTTP 200 |
| `lib.notification_prefs` / `maintenance_photos` / `autopay_job` / `charge_authorization` | Import OK |

## Auth-gate (unauthenticated)

| Route | Expected | Observed |
|-------|----------|----------|
| `GET /payments/cards` | 401 | 401 |
| `GET /users/me` | 401 | 401 |
| `PATCH /tenancies/me/autopay` | 401 | 401 |
| `POST /payments/cards/charge` | 401 | 401 |
| `GET /maintenance/me/photo` | 405 (POST only) | 405 |
| `GET /tenancies/me/autopay` | 405 (PATCH only) | 405 |

## UI wiring present

- Tenant + landlord Settings: `NotificationPrefsMatrix`, `SecurityMfaSessions`, Cards tab
- Tenant Home: `TenantAutopayCard`, pay-with-saved-card path
- Requests: file upload via `uploadMaintenancePhoto` (no URL paste)

## Still needs headed session

- MFA enroll QR (Supabase MFA must be enabled in project Auth settings)
- Add card Paystack popup (₦100) + autopay enable on active tenancy
- Maintenance photo upload with active lease

**Smoke status:** PASS (static + auth-gate). Headed product smoke = next when a lease-linked tenant session is available.
