"""Minimal product event ingest (IDs only — no PII payloads)."""

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user
from lib.db import create_service_client
from lib.phase2_exit import RENEWAL_BANNER_EVENT

router = APIRouter(prefix="/events", tags=["events"])


def _owned_unit(user: AuthedUser, unit_id: str) -> dict | None:
    rows = (
        user.db.table("units")
        .select("id, properties!inner(owner_id)")
        .eq("id", unit_id)
        .eq("properties.owner_id", user.id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


@router.post("/renewal-banner-viewed")
def renewal_banner_viewed(
    payload: dict,
    user: AuthedUser = Depends(get_current_user),
):
    """Record that the unit payments renewal banner was shown to this landlord."""
    unit_id = str(payload.get("unit_id") or "").strip()
    if not unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="unit_id is required",
        )
    if not _owned_unit(user, unit_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unit not found",
        )

    db = create_service_client()
    rows = (
        db.table("product_events")
        .insert(
            {
                "event_name": RENEWAL_BANNER_EVENT,
                "landlord_id": user.id,
                "unit_id": unit_id,
                "metadata": {},
            }
        )
        .execute()
        .data
        or []
    )
    return {"ok": True, "id": rows[0]["id"] if rows else None}
