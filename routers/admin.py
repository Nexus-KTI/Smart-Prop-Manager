from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from lib.admin import is_admin_email
from lib.auth import AuthedUser, get_current_user, require_admin
from lib.db import create_service_client
from lib.phase2_exit import compute_phase2_exit, format_phase2_exit_report
from lib.phase3_exit import compute_phase3_exit, format_phase3_exit_report
from lib.phase4_exit import compute_phase4_exit, format_phase4_exit_report

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/me")
def admin_me(user: AuthedUser = Depends(get_current_user)):
    return {
        "email": user.email,
        "is_admin": is_admin_email(user.email),
    }


@router.get("/phase2-exit")
def phase2_exit(
    user: AuthedUser = Depends(require_admin),
    window_days: int = Query(default=30, ge=1, le=365),
    plain: bool = Query(default=False),
):
    """Phase 2 exit metrics (admin-only). Use ?plain=1 for a text report."""
    del user  # auth gate only
    report = compute_phase2_exit(
        create_service_client(),
        window_days=window_days,
    )
    if plain:
        return PlainTextResponse(format_phase2_exit_report(report) + "\n")
    return report


@router.get("/phase3-exit")
def phase3_exit(
    user: AuthedUser = Depends(require_admin),
    window_days: int = Query(default=30, ge=1, le=365),
    plain: bool = Query(default=False),
):
    """Phase 3 exit metrics (admin-only). Use ?plain=1 for a text report."""
    del user
    report = compute_phase3_exit(
        create_service_client(),
        window_days=window_days,
    )
    if plain:
        return PlainTextResponse(format_phase3_exit_report(report) + "\n")
    return report


@router.get("/phase4-exit")
def phase4_exit(
    user: AuthedUser = Depends(require_admin),
    plain: bool = Query(default=False),
):
    """Phase 4 exit metrics (admin-only). Use ?plain=1 for a text report."""
    del user
    report = compute_phase4_exit(create_service_client())
    if plain:
        return PlainTextResponse(format_phase4_exit_report(report) + "\n")
    return report
