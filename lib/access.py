"""Phase 4 staff access control (Owner / Manager / Caretaker grants)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from fastapi import HTTPException, status

StaffRole = Literal["owner", "manager", "caretaker"]

# Permission keys — access_visitor_passes is schema-complete but Phase 5 no-op at runtime.
PERM_MONEY = "money"
PERM_MONEY_LOG_CASH = "money_log_cash"
PERM_CHASE = "chase"
PERM_DOCS_VIEW = "docs_view"
PERM_DOCS_UPLOAD = "docs_upload"
PERM_ACCESS_VISITOR_PASSES = "access_visitor_passes"
PERM_TEAM_INVITE = "team_invite"

ROLE_DEFAULTS: dict[str, dict[str, bool]] = {
    "manager": {
        PERM_MONEY: True,
        PERM_MONEY_LOG_CASH: True,
        PERM_CHASE: True,
        PERM_DOCS_VIEW: True,
        PERM_DOCS_UPLOAD: True,
        PERM_ACCESS_VISITOR_PASSES: True,  # Phase 5 slot
        PERM_TEAM_INVITE: True,  # limited: invite caretakers only (enforced in router)
    },
    "caretaker": {
        PERM_MONEY: False,
        PERM_MONEY_LOG_CASH: True,
        PERM_CHASE: True,
        PERM_DOCS_VIEW: True,
        PERM_DOCS_UPLOAD: True,  # limited
        PERM_ACCESS_VISITOR_PASSES: True,  # Phase 5 slot
        PERM_TEAM_INVITE: False,
    },
}

_FLAG_BY_PERM = {
    PERM_MONEY: "can_money",
    PERM_MONEY_LOG_CASH: "can_money_log_cash",
    PERM_CHASE: "can_chase",
    PERM_DOCS_VIEW: "can_docs_view",
    PERM_DOCS_UPLOAD: "can_docs_upload",
    PERM_ACCESS_VISITOR_PASSES: "can_access_visitor_passes",
    PERM_TEAM_INVITE: "can_team_invite",
}


@dataclass
class AccessContext:
    """Resolved access for a user acting on an owner's portfolio / unit / property."""

    user_id: str
    owner_id: str
    role: StaffRole
    membership_id: str | None = None
    permissions: set[str] = field(default_factory=set)
    property_ids: set[str] | None = None  # None = all owner properties

    def has(self, permission: str) -> bool:
        if self.role == "owner":
            return True
        # Phase 5: visitor-pass permission may be granted but capability is disabled.
        if permission == PERM_ACCESS_VISITOR_PASSES:
            return False
        return permission in self.permissions

    def require(self, permission: str) -> None:
        if not self.has(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission}",
            )


def defaults_for_role(role: str) -> dict[str, bool]:
    base = ROLE_DEFAULTS.get(role)
    if not base:
        raise ValueError(f"Unknown staff role: {role}")
    return dict(base)


def permissions_from_membership(row: dict[str, Any]) -> set[str]:
    perms: set[str] = set()
    for perm, col in _FLAG_BY_PERM.items():
        if row.get(col):
            perms.add(perm)
    return perms


def _svc():
    from lib.db import create_service_client

    return create_service_client()


def list_active_memberships(user_id: str) -> list[dict[str, Any]]:
    rows = (
        _svc()
        .table("staff_memberships")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "active")
        .execute()
        .data
        or []
    )
    return [dict(r) for r in rows]


def list_owned_property_ids(owner_id: str) -> set[str]:
    rows = (
        _svc()
        .table("properties")
        .select("id")
        .eq("owner_id", owner_id)
        .execute()
        .data
        or []
    )
    return {str(r["id"]) for r in rows if r.get("id")}


def membership_property_ids(membership: dict[str, Any]) -> set[str] | None:
    """None means all properties of the owner."""
    if membership.get("scope_all_properties", True):
        return None
    rows = (
        _svc()
        .table("staff_membership_properties")
        .select("property_id")
        .eq("membership_id", membership["id"])
        .execute()
        .data
        or []
    )
    return {str(r["property_id"]) for r in rows if r.get("property_id")}


def context_as_owner(user_id: str) -> AccessContext:
    return AccessContext(
        user_id=user_id,
        owner_id=user_id,
        role="owner",
        membership_id=None,
        permissions=set(_FLAG_BY_PERM.keys()),
        property_ids=None,
    )


def context_from_membership(user_id: str, membership: dict[str, Any]) -> AccessContext:
    role = membership.get("role") or "caretaker"
    if role not in ("manager", "caretaker"):
        role = "caretaker"
    return AccessContext(
        user_id=user_id,
        owner_id=str(membership["owner_id"]),
        role=role,  # type: ignore[arg-type]
        membership_id=str(membership["id"]),
        permissions=permissions_from_membership(membership),
        property_ids=membership_property_ids(membership),
    )


def portfolios_for_user(user_id: str) -> list[dict[str, Any]]:
    """Owned portfolio (if any properties) + active staff memberships."""
    out: list[dict[str, Any]] = []
    owned_count = len(list_owned_property_ids(user_id))
    if owned_count > 0:
        out.append(
            {
                "owner_id": user_id,
                "role": "owner",
                "membership_id": None,
                "property_count": owned_count,
                "is_self": True,
            }
        )
    for m in list_active_memberships(user_id):
        prop_ids = membership_property_ids(m)
        if prop_ids is None:
            count = len(list_owned_property_ids(str(m["owner_id"])))
        else:
            count = len(prop_ids)
        out.append(
            {
                "owner_id": str(m["owner_id"]),
                "role": m.get("role"),
                "membership_id": str(m["id"]),
                "property_count": count,
                "is_self": False,
                "permissions": sorted(permissions_from_membership(m)),
            }
        )
    return out


def resolve_portfolio(user_id: str, owner_id: str | None) -> AccessContext:
    """
    Resolve which portfolio the user is acting on.
    Owners acting on themselves need no membership.
    Staff must have an active membership for owner_id.
    """
    oid = (owner_id or "").strip() or None

    if oid is None:
        if list_owned_property_ids(user_id):
            return context_as_owner(user_id)
        memberships = list_active_memberships(user_id)
        if memberships:
            return context_from_membership(user_id, memberships[0])
        return context_as_owner(user_id)

    if oid == user_id:
        return context_as_owner(user_id)

    for m in list_active_memberships(user_id):
        if str(m["owner_id"]) == oid:
            return context_from_membership(user_id, m)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not a member of this portfolio",
    )


def _property_owner_id(property_id: str) -> str | None:
    rows = (
        _svc()
        .table("properties")
        .select("owner_id")
        .eq("id", property_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    oid = rows[0].get("owner_id")
    return str(oid) if oid else None


def _unit_property_owner(unit_id: str) -> tuple[str, str] | None:
    """Return (property_id, owner_id) for a unit."""
    rows = (
        _svc()
        .table("units")
        .select("id, property_id, properties!inner(owner_id)")
        .eq("id", unit_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    row = rows[0]
    prop = row.get("properties") or {}
    if isinstance(prop, list):
        prop = prop[0] if prop else {}
    owner_id = prop.get("owner_id")
    property_id = row.get("property_id")
    if not owner_id or not property_id:
        return None
    return str(property_id), str(owner_id)


def property_in_scope(ctx: AccessContext, property_id: str) -> bool:
    if ctx.property_ids is None:
        return True
    return property_id in ctx.property_ids


def require_property_access(
    user_id: str,
    property_id: str,
    *,
    permission: str | None = None,
) -> AccessContext:
    owner_id = _property_owner_id(property_id)
    if not owner_id:
        raise HTTPException(status_code=404, detail="Property not found")
    if owner_id == user_id:
        ctx = context_as_owner(user_id)
    else:
        ctx = resolve_portfolio(user_id, owner_id)
        if not property_in_scope(ctx, property_id):
            raise HTTPException(status_code=403, detail="Property out of grant scope")
    if permission:
        ctx.require(permission)
    return ctx


def require_unit_access(
    user_id: str,
    unit_id: str,
    *,
    permission: str | None = None,
) -> AccessContext:
    loc = _unit_property_owner(unit_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Unit not found")
    property_id, owner_id = loc
    if owner_id == user_id:
        ctx = context_as_owner(user_id)
    else:
        ctx = resolve_portfolio(user_id, owner_id)
        if not property_in_scope(ctx, property_id):
            raise HTTPException(status_code=403, detail="Unit out of grant scope")
    if permission:
        ctx.require(permission)
    return ctx


def accessible_property_ids_for_portfolio(ctx: AccessContext) -> list[str]:
    if ctx.property_ids is not None:
        return sorted(ctx.property_ids)
    return sorted(list_owned_property_ids(ctx.owner_id))


def can_create_properties(ctx: AccessContext) -> bool:
    """Only owners create properties in their portfolio."""
    return ctx.role == "owner"


def money_permission_for_manual(ctx: AccessContext) -> str:
    """Caretakers need log-cash; managers/owners need money (or log-cash)."""
    if ctx.has(PERM_MONEY):
        return PERM_MONEY
    return PERM_MONEY_LOG_CASH
