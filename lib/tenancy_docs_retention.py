"""Dry-run-first retention processing for tenancy documents."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from lib.tenancy_docs import (
    delete_document_object,
    docs_retention_purge_enabled,
    retention_due,
)

logger = logging.getLogger(__name__)


def retention_block_reason(client: Any, row: dict[str, Any]) -> str | None:
    document_id = str(row.get("id") or "")
    tenancy_id = str(row.get("tenancy_id") or "")
    if row.get("legal_hold"):
        return "cached_legal_hold"

    holds = (
        client.table("tenancy_document_holds")
        .select("id")
        .eq("document_id", document_id)
        .is_("released_at", "null")
        .limit(1)
        .execute()
        .data
        or []
    )
    if holds:
        return "active_legal_hold"

    tenancies = (
        client.table("tenancies")
        .select("status")
        .eq("id", tenancy_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if tenancies and tenancies[0].get("status") == "active":
        return "active_tenancy"

    submissions = (
        client.table("tenancy_document_submissions")
        .select("request_id")
        .eq("document_id", document_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if submissions:
        requests = (
            client.table("tenancy_document_requests")
            .select("status")
            .eq("id", submissions[0].get("request_id"))
            .limit(1)
            .execute()
            .data
            or []
        )
        if requests and requests[0].get("status") not in {"accepted", "cancelled"}:
            return "open_document_request"

    links = (
        client.table("tenancy_privacy_request_documents")
        .select("privacy_request_id, relation_type")
        .eq("document_id", document_id)
        .execute()
        .data
        or []
    )
    case_ids = [
        row_link.get("privacy_request_id")
        for row_link in links
        if row_link.get("relation_type") in {"restricted", "erasure_review"}
    ]
    if case_ids:
        cases = (
            client.table("tenancy_privacy_requests")
            .select("id, status")
            .in_("id", case_ids)
            .execute()
            .data
            or []
        )
        if any(case.get("status") not in {"completed", "refused"} for case in cases):
            return "open_privacy_request"
    return None


def run_retention(
    *,
    dry_run: bool = True,
    on_day: date | None = None,
    client: Any | None = None,
) -> dict[str, Any]:
    """Find retention-expired documents and optionally purge private objects.

    Commit mode is impossible unless DOCS_RETENTION_PURGE_ENABLED=true.
    Each successful purge records an event and preserves the metadata row.
    """
    if not dry_run and not docs_retention_purge_enabled():
        raise RuntimeError("Retention purge is disabled")

    if client is None:
        from lib.db import create_service_client

        client = create_service_client()

    rows = (
        client.table("tenancy_documents")
        .select(
            "id, tenancy_id, storage_path, retain_until, legal_hold, "
            "deleted_at, purged_at"
        )
        .is_("purged_at", "null")
        .execute()
        .data
        or []
    )
    pending_operations: list[dict[str, Any]] = []
    for operation, column in (
        ("delete", "deletion_evidence_pending"),
        ("purge", "purge_evidence_pending"),
        ("orphan_cleanup", "orphan_cleanup_pending"),
    ):
        pending_rows = (
            client.table("tenancy_documents")
            .select(
                f"id, tenancy_id, storage_path, deleted_by, uploaded_by, {column}"
            )
            .eq(column, True)
            .execute()
            .data
            or []
        )
        pending_operations.extend(
            {**dict(pending), "operation": operation} for pending in pending_rows
        )
    date_due = retention_due(
        [{**dict(row), "legal_hold": False} for row in rows],
        on_day=on_day,
    )
    original_by_id = {str(row.get("id") or ""): dict(row) for row in rows}
    due: list[dict[str, Any]] = []
    blocked: list[dict[str, str]] = []
    for candidate in date_due:
        row = original_by_id.get(str(candidate.get("id") or ""), dict(candidate))
        reason = retention_block_reason(client, row)
        if reason:
            blocked.append(
                {"document_id": str(row.get("id") or ""), "reason": reason}
            )
        else:
            due.append(row)
    result: dict[str, Any] = {
        "dry_run": dry_run,
        "due": len(due),
        "blocked": blocked,
        "purged": 0,
        "skipped": 0,
        "failed": [],
        "document_ids": [str(row.get("id") or "") for row in due],
        "evidence_pending": [
            {
                "document_id": str(row.get("id") or ""),
                "operation": str(row.get("operation") or ""),
            }
            for row in pending_operations
        ],
        "evidence_reconciled": 0,
    }
    if dry_run:
        return result

    now = datetime.now(timezone.utc).isoformat()
    for pending in pending_operations:
        pending_id = str(pending.get("id") or "")
        operation = str(pending.get("operation") or "")
        try:
            delete_document_object(str(pending.get("storage_path") or ""))
            client.rpc(
                "complete_tenancy_document_storage_operation",
                {
                    "p_document_id": pending_id,
                    "p_operation": operation,
                    "p_actor_id": (
                        pending.get("deleted_by")
                        or pending.get("uploaded_by")
                        or None
                    ),
                },
            ).execute()
            result["evidence_reconciled"] += 1
        except Exception as exc:
            result["failed"].append(
                {
                    "document_id": pending_id,
                    "error": f"evidence reconciliation failed: {str(exc)[:200]}",
                }
            )

    for row in due:
        document_id = str(row.get("id") or "")
        tenancy_id = str(row.get("tenancy_id") or "")
        uses_atomic_claim = hasattr(client, "rpc")
        if uses_atomic_claim:
            claimed_data = (
                client.rpc(
                    "claim_tenancy_document_purge",
                    {"p_document_id": document_id, "p_purged_at": now},
                )
                .execute()
                .data
            )
            if isinstance(claimed_data, dict):
                claimed = [claimed_data] if claimed_data.get("id") else []
            else:
                claimed = claimed_data or []
        else:  # Lightweight local test doubles; production uses the locked RPC.
            claimed = (
                client.table("tenancy_documents")
                .update(
                    {"purged_at": now, "deleted_at": row.get("deleted_at") or now}
                )
                .eq("id", document_id)
                .eq("legal_hold", False)
                .is_("purged_at", "null")
                .execute()
                .data
                or []
            )
        if not claimed:
            result["skipped"] += 1
            continue
        event_base = {
            "document_id": document_id,
            "tenancy_id": tenancy_id,
            "actor_id": None,
        }
        if not uses_atomic_claim:
            try:
                client.table("tenancy_document_events").insert(
                    {
                        **event_base,
                        "event_type": "purge_started",
                        "metadata": {"retain_until": row.get("retain_until")},
                    }
                ).execute()
            except Exception as exc:
                (
                    client.table("tenancy_documents")
                    .update(
                        {
                            "purged_at": None,
                            "deleted_at": row.get("deleted_at"),
                        }
                    )
                    .eq("id", document_id)
                    .execute()
                )
                result["failed"].append(
                    {
                        "document_id": document_id,
                        "error": f"audit start failed: {str(exc)[:200]}",
                    }
                )
                continue
        try:
            delete_document_object(str(row.get("storage_path") or ""))
        except Exception as exc:
            (
                client.table("tenancy_documents")
                .update(
                    {
                        "purged_at": None,
                        "deleted_at": row.get("deleted_at"),
                        "purge_evidence_pending": False,
                    }
                )
                .eq("id", document_id)
                .execute()
            )
            try:
                client.table("tenancy_document_events").insert(
                    {
                        **event_base,
                        "event_type": "purge_failed",
                        "metadata": {"error": str(exc)[:240]},
                    }
                ).execute()
            except Exception:
                logger.exception("Could not record failed retention purge %s", document_id)
            result["failed"].append(
                {"document_id": document_id, "error": str(exc)[:240]}
            )
            continue

        try:
            if uses_atomic_claim:
                client.rpc(
                    "complete_tenancy_document_storage_operation",
                    {
                        "p_document_id": document_id,
                        "p_operation": "purge",
                        "p_actor_id": None,
                    },
                ).execute()
            else:
                client.table("tenancy_document_events").insert(
                    {
                        **event_base,
                        "event_type": "purged",
                        "metadata": {"retain_until": row.get("retain_until")},
                    }
                ).execute()
            result["purged"] += 1
        except Exception as exc:
            result["failed"].append(
                {
                    "document_id": document_id,
                    "error": f"purged but audit event failed: {str(exc)[:200]}",
                }
            )
    return result
