"""Estate publications / bulletin."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from lib.auth import AuthedUser, get_current_user

router = APIRouter(prefix="/publications", tags=["publications"])


def _first_row(data: Any) -> dict | None:
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    return None


@router.get("/")
def list_publications(user: AuthedUser = Depends(get_current_user)):
    PUBLICATIONS_PAGE_LIMIT = 100
    rows = (
        user.db.table("publications")
        .select("*")
        .eq("landlord_id", user.id)
        .is_("archived_at", "null")
        .order("published_at", desc=True)
        .limit(PUBLICATIONS_PAGE_LIMIT)
        .execute()
        .data
        or []
    )
    return {
        "items": rows,
        "loaded": len(rows),
        "capped": len(rows) >= PUBLICATIONS_PAGE_LIMIT,
    }


@router.get("/me")
def list_my_publications(user: AuthedUser = Depends(get_current_user)):
    rows = (
        user.db.table("publications")
        .select("*")
        .is_("archived_at", "null")
        .order("published_at", desc=True)
        .limit(50)
        .execute()
        .data
        or []
    )
    reads = (
        user.db.table("publication_reads")
        .select("publication_id")
        .eq("user_id", user.id)
        .limit(200)
        .execute()
        .data
        or []
    )
    read_ids = {r["publication_id"] for r in reads if r.get("publication_id")}
    items = []
    for row in rows:
        item = dict(row)
        item["is_read"] = item.get("id") in read_ids
        items.append(item)
    unread = sum(1 for i in items if not i.get("is_read"))
    return {"items": items, "unread_count": unread}


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_publication(payload: dict, user: AuthedUser = Depends(get_current_user)):
    title = (payload.get("title") or "").strip()
    body = (payload.get("body") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not body:
        raise HTTPException(status_code=400, detail="Body is required")
    if len(title) > 160:
        raise HTTPException(status_code=400, detail="Title too long")
    if len(body) > 8000:
        raise HTTPException(status_code=400, detail="Body too long")

    property_id = payload.get("property_id") or None
    if property_id:
        props = (
            user.db.table("properties")
            .select("id")
            .eq("id", property_id)
            .eq("owner_id", user.id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not props:
            raise HTTPException(status_code=404, detail="Property not found")

    row = {
        "landlord_id": user.id,
        "property_id": property_id,
        "title": title,
        "body": body,
        "published_at": datetime.now(timezone.utc).isoformat(),
    }
    inserted = user.db.table("publications").insert(row).execute().data
    created = _first_row(inserted)
    if not created:
        raise HTTPException(status_code=500, detail="Could not publish")
    return {"item": created}


@router.post("/{publication_id}/read")
def mark_read(publication_id: str, user: AuthedUser = Depends(get_current_user)):
    visible = (
        user.db.table("publications")
        .select("id")
        .eq("id", publication_id)
        .is_("archived_at", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not visible:
        raise HTTPException(status_code=404, detail="Publication not found")
    user.db.table("publication_reads").upsert(
        {
            "publication_id": publication_id,
            "user_id": user.id,
            "read_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()
    return {"ok": True}


@router.post("/{publication_id}/archive")
def archive_publication(
    publication_id: str, user: AuthedUser = Depends(get_current_user)
):
    now = datetime.now(timezone.utc).isoformat()
    updated = (
        user.db.table("publications")
        .update({"archived_at": now})
        .eq("id", publication_id)
        .eq("landlord_id", user.id)
        .execute()
        .data
    )
    row = _first_row(updated)
    if not row:
        raise HTTPException(status_code=404, detail="Publication not found")
    return {"item": row}
