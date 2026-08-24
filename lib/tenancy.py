"""Phase 3 tenancy checklist rules (occupancy activation gating)."""

from __future__ import annotations

from typing import Any

REQUIRED_CHECKLIST_KEYS = (
    "checklist_id_collected",
    "checklist_agreement_signed",
    "checklist_references_checked",
)

OPTIONAL_IDENTITY_KEY = "checklist_identity_verified"

CHECKLIST_LABELS = {
    "checklist_id_collected": "ID collected",
    "checklist_agreement_signed": "Agreement signed",
    "checklist_references_checked": "References checked",
    "checklist_identity_verified": "Confirm identity (NIN/BVN)",
}


def required_checklist_complete(tenancy: dict[str, Any]) -> bool:
    return all(bool(tenancy.get(key)) for key in REQUIRED_CHECKLIST_KEYS)


def can_activate_occupancy(tenancy: dict[str, Any]) -> bool:
    """Required checklist must pass; optional identity verify must NOT gate."""
    return required_checklist_complete(tenancy)


def activation_blockers(tenancy: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    for key in REQUIRED_CHECKLIST_KEYS:
        if not tenancy.get(key):
            missing.append(CHECKLIST_LABELS[key])
    return missing
