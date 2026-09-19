from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from lib.admin import is_admin_email
from lib.auth import AuthedUser, get_current_user, require_admin, require_admin_aal2
from lib.db import create_service_client
from lib.phase2_exit import compute_phase2_exit, format_phase2_exit_report
from lib.phase3_exit import compute_phase3_exit, format_phase3_exit_report
from lib.phase4_exit import compute_phase4_exit, format_phase4_exit_report
from lib.rate_limit import enforce_rate_limit
from lib.tenancy_docs import privacy_cases_enabled

router = APIRouter(prefix="/admin", tags=["admin"])


def _required_idempotency_key(request: Request) -> str:
    key = (request.headers.get("idempotency-key") or "").strip()
    if len(key) < 8 or len(key) > 120:
        raise HTTPException(status_code=400, detail="Valid Idempotency-Key required")
    return key


def _enforce_privacy_operator_limit(user: AuthedUser) -> None:
    enforce_rate_limit(
        f"privacy-operator:{user.id}",
        limit=60,
        window_seconds=60,
        detail="Too many privacy operations. Try again in a minute.",
    )


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


@router.get("/privacy-requests")
def list_privacy_request_cases(
    user: AuthedUser = Depends(require_admin_aal2),
):
    del user
    if not privacy_cases_enabled():
        raise HTTPException(status_code=403, detail="Privacy case workflow is disabled")
    svc = create_service_client()
    rows = (
        svc.table("tenancy_privacy_requests")
        .select("*")
        .order("received_at", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    case_ids = [str(row.get("id") or "") for row in rows if row.get("id")]
    events = []
    links = []
    if case_ids:
        events = (
            svc.table("tenancy_privacy_request_events")
            .select(
                "id, privacy_request_id, actor_id, event_type, "
                "reason_code, created_at"
            )
            .in_("privacy_request_id", case_ids)
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )
        links = (
            svc.table("tenancy_privacy_request_documents")
            .select(
                "privacy_request_id, document_id, relation_type, "
                "created_by, created_at"
            )
            .in_("privacy_request_id", case_ids)
            .execute()
            .data
            or []
        )
    items = []
    for raw in rows:
        item = dict(raw)
        case_id = str(item.get("id") or "")
        item["events"] = [
            dict(event)
            for event in events
            if str(event.get("privacy_request_id") or "") == case_id
        ]
        item["document_scope"] = [
            dict(link)
            for link in links
            if str(link.get("privacy_request_id") or "") == case_id
        ]
        items.append(item)
    return {"items": items, "loaded": len(items), "capped": len(items) == 200}


@router.post("/privacy-requests/{privacy_request_id}/verify-identity")
def verify_privacy_request_identity(
    privacy_request_id: str,
    request: Request,
    user: AuthedUser = Depends(require_admin_aal2),
):
    if not privacy_cases_enabled():
        raise HTTPException(status_code=403, detail="Privacy case workflow is disabled")
    _enforce_privacy_operator_limit(user)
    idempotency_key = _required_idempotency_key(request)
    try:
        data = (
            create_service_client()
            .rpc(
                "verify_tenancy_privacy_request_identity",
                {
                    "p_privacy_request_id": privacy_request_id,
                    "p_actor_id": user.id,
                    "p_idempotency_key": idempotency_key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise HTTPException(status_code=409, detail="Identity step cannot be updated") from exc
    return {"item": data[0] if isinstance(data, list) and data else data}


@router.patch("/privacy-requests/{privacy_request_id}")
def update_privacy_request_case(
    privacy_request_id: str,
    request: Request,
    payload: dict,
    user: AuthedUser = Depends(require_admin_aal2),
):
    if not privacy_cases_enabled():
        raise HTTPException(status_code=403, detail="Privacy case workflow is disabled")
    _enforce_privacy_operator_limit(user)
    idempotency_key = _required_idempotency_key(request)
    next_status = (payload.get("status") or "").strip().lower()
    outcome_code = (payload.get("outcome_code") or "").strip() or None
    if next_status not in {
        "identity_check",
        "in_review",
        "restricted",
        "completed",
        "refused",
    }:
        raise HTTPException(status_code=400, detail="Invalid privacy request status")
    if outcome_code and len(outcome_code) > 80:
        raise HTTPException(status_code=400, detail="outcome_code is too long")
    try:
        data = (
            create_service_client()
            .rpc(
                "update_tenancy_privacy_request",
                {
                    "p_privacy_request_id": privacy_request_id,
                    "p_actor_id": user.id,
                    "p_status": next_status,
                    "p_outcome_code": outcome_code,
                    "p_idempotency_key": idempotency_key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise HTTPException(status_code=409, detail="Privacy case cannot be updated") from exc
    return {"item": data[0] if isinstance(data, list) and data else data}


@router.post("/privacy-requests/{privacy_request_id}/documents")
def link_privacy_request_document(
    privacy_request_id: str,
    request: Request,
    payload: dict,
    user: AuthedUser = Depends(require_admin_aal2),
):
    if not privacy_cases_enabled():
        raise HTTPException(status_code=403, detail="Privacy case workflow is disabled")
    _enforce_privacy_operator_limit(user)
    idempotency_key = _required_idempotency_key(request)
    document_id = (payload.get("document_id") or "").strip()
    relation_type = (payload.get("relation_type") or "").strip().lower()
    if not document_id or relation_type not in {
        "in_scope",
        "restricted",
        "disclosed",
        "erasure_review",
    }:
        raise HTTPException(status_code=400, detail="Invalid document scope link")
    try:
        data = (
            create_service_client()
            .rpc(
                "link_tenancy_privacy_request_document",
                {
                    "p_privacy_request_id": privacy_request_id,
                    "p_document_id": document_id,
                    "p_actor_id": user.id,
                    "p_relation_type": relation_type,
                    "p_idempotency_key": idempotency_key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise HTTPException(status_code=409, detail="Document cannot be linked") from exc
    return {"item": data[0] if isinstance(data, list) and data else data}


@router.post("/privacy-requests/{privacy_request_id}/evidence")
def record_privacy_request_evidence(
    privacy_request_id: str,
    request: Request,
    payload: dict,
    user: AuthedUser = Depends(require_admin_aal2),
):
    if not privacy_cases_enabled():
        raise HTTPException(status_code=403, detail="Privacy case workflow is disabled")
    _enforce_privacy_operator_limit(user)
    idempotency_key = _required_idempotency_key(request)
    event_type = (payload.get("event_type") or "").strip().lower()
    reason_code = (payload.get("reason_code") or "").strip() or None
    if event_type not in {
        "scope_confirmed",
        "export_prepared",
        "decision_recorded",
    }:
        raise HTTPException(status_code=400, detail="Invalid evidence event")
    if reason_code and len(reason_code) > 80:
        raise HTTPException(status_code=400, detail="reason_code is too long")
    try:
        data = (
            create_service_client()
            .rpc(
                "record_tenancy_privacy_request_evidence",
                {
                    "p_privacy_request_id": privacy_request_id,
                    "p_actor_id": user.id,
                    "p_event_type": event_type,
                    "p_reason_code": reason_code,
                    "p_idempotency_key": idempotency_key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise HTTPException(status_code=409, detail="Evidence cannot be recorded") from exc
    return {"item": data[0] if isinstance(data, list) and data else data}


@router.post("/documents/{document_id}/holds")
def apply_document_hold(
    document_id: str,
    request: Request,
    payload: dict,
    user: AuthedUser = Depends(require_admin_aal2),
):
    if not privacy_cases_enabled():
        raise HTTPException(status_code=403, detail="Privacy case workflow is disabled")
    _enforce_privacy_operator_limit(user)
    idempotency_key = _required_idempotency_key(request)
    reason_code = (payload.get("reason_code") or "").strip().lower()
    external_reference = (payload.get("external_reference") or "").strip() or None
    if reason_code not in {
        "legal_claim",
        "regulatory_request",
        "privacy_request",
        "incident_investigation",
    }:
        raise HTTPException(status_code=400, detail="Invalid hold reason")
    try:
        data = (
            create_service_client()
            .rpc(
                "apply_tenancy_document_hold",
                {
                    "p_document_id": document_id,
                    "p_actor_id": user.id,
                    "p_reason_code": reason_code,
                    "p_external_reference": external_reference,
                    "p_idempotency_key": idempotency_key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise HTTPException(status_code=409, detail="Legal hold cannot be applied") from exc
    return {"item": data[0] if isinstance(data, list) and data else data}


@router.post("/document-holds/{hold_id}/release")
def release_document_hold(
    hold_id: str,
    request: Request,
    payload: dict,
    user: AuthedUser = Depends(require_admin_aal2),
):
    if not privacy_cases_enabled():
        raise HTTPException(status_code=403, detail="Privacy case workflow is disabled")
    _enforce_privacy_operator_limit(user)
    idempotency_key = _required_idempotency_key(request)
    release_reason = (payload.get("release_reason") or "").strip()
    if not release_reason or len(release_reason) > 500:
        raise HTTPException(
            status_code=400,
            detail="release_reason must be 1-500 characters",
        )
    try:
        data = (
            create_service_client()
            .rpc(
                "release_tenancy_document_hold",
                {
                    "p_hold_id": hold_id,
                    "p_actor_id": user.id,
                    "p_release_reason": release_reason,
                    "p_idempotency_key": idempotency_key,
                },
            )
            .execute()
            .data
        )
    except Exception as exc:
        raise HTTPException(status_code=409, detail="Legal hold cannot be released") from exc
    return {"item": data[0] if isinstance(data, list) and data else data}
