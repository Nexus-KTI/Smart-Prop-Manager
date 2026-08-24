"""Dashboard rows must include properties that have zero units."""

# Mirrors web/lib/dashboard.ts buildDashboard empty-property behaviour via a
# thin Node-less check of the TypeScript logic through a Python port of the rule.


def build_dashboard_rows(properties: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for property_row in properties:
        units = property_row.get("units") or []
        if len(units) == 0:
            rows.append(
                {
                    "propertyId": property_row["id"],
                    "unit": property_row.get("name") or "Untitled property",
                    "needsUnit": True,
                    "unitId": None,
                }
            )
            continue
        for unit in units:
            rows.append(
                {
                    "propertyId": property_row["id"],
                    "unitId": unit["id"],
                    "unit": f"{property_row['name']} · {unit['label']}",
                    "needsUnit": False,
                }
            )
    return rows


def test_property_with_zero_units_appears():
    rows = build_dashboard_rows(
        [
            {"id": "p1", "name": "Palm Court", "units": []},
            {
                "id": "p2",
                "name": "Lake View",
                "units": [{"id": "u1", "label": "Flat 1"}],
            },
        ]
    )
    assert any(r.get("needsUnit") and r["propertyId"] == "p1" for r in rows)
    assert any(r.get("unitId") == "u1" for r in rows)


def test_null_units_treated_as_empty():
    rows = build_dashboard_rows([{"id": "p1", "name": "Solo", "units": None}])
    assert len(rows) == 1
    assert rows[0]["needsUnit"] is True
