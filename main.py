import os

from dotenv import load_dotenv

load_dotenv()

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import admin, events, leads, notify_diag, payments, properties, reminders, staff, tenancies, users

_sentry_dsn = (os.getenv("SENTRY_DSN") or "").strip()
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE") or "0.1"),
        send_default_pii=False,
    )


def _cors_origins() -> list[str]:
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    raw = os.getenv("CORS_ORIGINS") or os.getenv("FRONTEND_URL") or ""
    extras = [part.strip().rstrip("/") for part in raw.split(",") if part.strip()]
    # Preserve order, drop dupes
    seen: set[str] = set()
    origins: list[str] = []
    for origin in defaults + extras:
        if origin not in seen:
            seen.add(origin)
            origins.append(origin)
    return origins


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(properties.router)
app.include_router(payments.router)
app.include_router(reminders.router)
app.include_router(tenancies.router)
app.include_router(staff.router)
app.include_router(leads.router)
app.include_router(admin.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(notify_diag.router)


@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok"}
