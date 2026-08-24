"""Tenancy checklist gating (Phase 3)."""

from __future__ import annotations

from lib.tenancy import (
    activation_blockers,
    can_activate_occupancy,
    required_checklist_complete,
)


def test_required_checklist_gates_activation():
    incomplete = {
        "checklist_id_collected": True,
        "checklist_agreement_signed": True,
        "checklist_references_checked": False,
        "checklist_identity_verified": False,
    }
    assert required_checklist_complete(incomplete) is False
    assert can_activate_occupancy(incomplete) is False
    assert "References checked" in activation_blockers(incomplete)


def test_optional_identity_does_not_gate_activation():
    required_only = {
        "checklist_id_collected": True,
        "checklist_agreement_signed": True,
        "checklist_references_checked": True,
        "checklist_identity_verified": False,
    }
    assert required_checklist_complete(required_only) is True
    assert can_activate_occupancy(required_only) is True
    assert activation_blockers(required_only) == []

    with_identity = {**required_only, "checklist_identity_verified": True}
    assert can_activate_occupancy(with_identity) is True


def test_empty_tenancy_cannot_activate():
    empty = {}
    assert can_activate_occupancy(empty) is False
    assert len(activation_blockers(empty)) == 3
