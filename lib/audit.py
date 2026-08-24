"""Phase 4 functional audit trail (staff money/chase actions)."""

from __future__ import annotations

from typing import Any

from lib.access import AccessContext


def record_audit(
    ctx: AccessContext,
    *,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Persist an audit row. Owners acting as themselves are skipped (not staff)."""
    if ctx.role == "owner":
        return
    try:
        from lib.db import create_service_client

        create_service_client().table("audit_events").insert(
            {
                "actor_user_id": ctx.user_id,
                "owner_id": ctx.owner_id,
                "actor_role": ctx.role,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "membership_id": ctx.membership_id,
                "metadata": metadata or {},
            }
        ).execute()
    except Exception:
        # Audit must not break the primary action; swallow storage errors.
        pass


def list_audit_for_owner(
    owner_id: str,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    from lib.db import create_service_client

    rows = (
        create_service_client()
        .table("audit_events")
        .select("*")
        .eq("owner_id", owner_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    return [dict(r) for r in rows]
