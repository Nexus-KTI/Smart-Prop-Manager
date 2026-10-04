import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware

from lib.edge import SecurityHeadersMiddleware, TrustedHostMiddleware
from lib.observability import RequestIdMiddleware, configure_logging, init_sentry
from lib.request_limits import DocumentUploadLimitMiddleware
from routers import (
    access,
    admin,
    applications,
    artisans,
    cron_jobs,
    events,
    expenses,
    leads,
    maintenance,
    messages,
    notify_diag,
    payments,
    properties,
    public_leads,
    publications,
    reminders,
    staff,
    tasks,
    tenancies,
    users,
    utilities,
)

configure_logging()
init_sentry()


def _cors_origins() -> list[str]:
    defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        # Production Next.js on Vercel (Hobby). Env can still add more.
        "https://smart-prop-web.vercel.app",
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


def _cors_origin_regex() -> str | None:
    """Any localhost port off Render (Render sets RENDER=true on its hosts)."""
    if (os.getenv("RENDER") or "").strip():
        return None
    return r"http://(localhost|127\.0\.0\.1)(:\d+)?"


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    yield
    from lib.db import close_shared_clients
    from lib.http_client import close_http_client
    from lib.notify import close_notification_clients

    close_notification_clients()
    close_http_client()
    close_shared_clients()


app = FastAPI(lifespan=_lifespan)

app.add_middleware(DocumentUploadLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
# Last added runs first: request ID → host check → security headers → gzip → CORS.
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TrustedHostMiddleware)
app.add_middleware(RequestIdMiddleware)

app.include_router(properties.router)
app.include_router(payments.router)
app.include_router(reminders.router)
app.include_router(cron_jobs.router)
app.include_router(tenancies.router)
app.include_router(maintenance.router)
app.include_router(utilities.router)
app.include_router(access.router)
app.include_router(artisans.router)
app.include_router(applications.router)
app.include_router(expenses.router)
app.include_router(publications.router)
app.include_router(tasks.router)
app.include_router(messages.router)
app.include_router(staff.router)
app.include_router(leads.router)
app.include_router(public_leads.router)
app.include_router(admin.router)
app.include_router(events.router)
app.include_router(users.router)
app.include_router(notify_diag.router)


@app.exception_handler(httpx.TransportError)
async def supabase_transport_error(_request: Request, _exc: httpx.TransportError):
    """A dropped Supabase connection must still carry CORS headers."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Could not reach the account service. Try again."},
    )


@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    """Deeper than /health: database reachable in 2s, plus outbox backlog age."""
    from lib.readiness import check_readiness

    ok, body = check_readiness()
    return JSONResponse(status_code=200 if ok else 503, content=body)
