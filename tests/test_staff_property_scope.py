"""Staff invite property scope."""

from routers.staff import normalize_staff_property_scope


def test_empty_scope_means_all_properties():
    ids, scope_all = normalize_staff_property_scope(None)
    assert ids == []
    assert scope_all is True
    ids, scope_all = normalize_staff_property_scope([])
    assert ids == []
    assert scope_all is True


def test_named_properties_are_limited_and_deduped():
    ids, scope_all = normalize_staff_property_scope(["p1", " p1 ", "", "p2"])
    assert ids == ["p1", "p2"]
    assert scope_all is False
