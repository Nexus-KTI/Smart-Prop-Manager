"""The ledger-N path in mark.svg is the only mark geometry."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "web" / "public" / "brand"
MARK_SVG = BRAND / "mark.svg"
BRAND_MARK_TSX = ROOT / "web" / "components" / "BrandMark.tsx"

DERIVED = (
    "mark-forest.svg",
    "mark-ink.svg",
    "app-icon.svg",
    "avatar-circle.svg",
)
APP_ICON = ROOT / "web" / "app" / "icon.svg"

PATH_RE = re.compile(r'\sd="([^"]+)"')


def _d(text: str, label: str) -> str:
    found = PATH_RE.findall(text)
    assert len(found) == 1, f"{label} should contain exactly one path d"
    return found[0]


def test_derived_marks_match_mark_svg():
    source = _d(MARK_SVG.read_text(encoding="utf-8"), "mark.svg")
    assert "zm3.5 9h15v2h-15v-2z" in source

    tsx = _d(BRAND_MARK_TSX.read_text(encoding="utf-8"), "BrandMark.tsx")
    assert tsx == source

    for name in DERIVED:
        path = BRAND / name
        assert _d(path.read_text(encoding="utf-8"), name) == source

    assert _d(APP_ICON.read_text(encoding="utf-8"), "app/icon.svg") == source


def test_app_icon_and_avatar_keep_locked_fills():
    app_icon = (BRAND / "app-icon.svg").read_text(encoding="utf-8")
    assert 'rx="8"' in app_icon
    assert 'fill="#0F6E4F"' in app_icon
    assert 'fill="#FFFFFF"' in app_icon

    avatar = (BRAND / "avatar-circle.svg").read_text(encoding="utf-8")
    assert "<circle" in avatar
    assert 'fill="#0F6E4F"' in avatar
    assert 'fill="#FFFFFF"' in avatar

    forest = (BRAND / "mark-forest.svg").read_text(encoding="utf-8")
    assert 'fill="#0F6E4F"' in forest
    ink = (BRAND / "mark-ink.svg").read_text(encoding="utf-8")
    assert 'fill="#14171A"' in ink
