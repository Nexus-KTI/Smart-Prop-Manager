"""Portfolio summary counts for the Properties header (independent of paging)."""

from __future__ import annotations

from routers.properties import summarize_portfolio_counts


def test_summary_counts_units_and_vacancy_per_property():
    summary = summarize_portfolio_counts(
        [
            {
                "id": "p1",
                "units": [
                    {"id": "u1", "tenant_name": "Ada"},
                    {"id": "u2", "tenant_name": "  "},
                    {"id": "u3", "tenant_name": None},
                ],
            },
            {"id": "p2", "units": [{"id": "u4", "tenant_name": "Bode"}]},
            {"id": "p3", "units": None},
        ]
    )
    assert summary["property_count"] == 3
    assert summary["unit_count"] == 4
    assert summary["occupied"] == 2
    assert summary["vacant"] == 2
    assert summary["properties"] == [
        {"property_id": "p1", "units": 3, "vacant": 2},
        {"property_id": "p2", "units": 1, "vacant": 0},
        {"property_id": "p3", "units": 0, "vacant": 0},
    ]


def test_summary_empty_portfolio():
    summary = summarize_portfolio_counts([])
    assert summary == {
        "property_count": 0,
        "unit_count": 0,
        "occupied": 0,
        "vacant": 0,
        "properties": [],
    }
