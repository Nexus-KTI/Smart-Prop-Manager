"""The N in mark.svg is the only mark geometry."""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "web" / "app"
BRAND = ROOT / "web" / "public" / "brand"
MARK_SVG = BRAND / "mark.svg"
BRAND_MARK_TSX = ROOT / "web" / "components" / "BrandMark.tsx"

DERIVED = (
    "mark-forest.svg",
    "mark-ink.svg",
    "app-icon.svg",
    "avatar-circle.svg",
)
APP_ICON = APP / "icon.svg"
PATH_RE = re.compile(r'\sd="([^"]+)"')


def _paths(text: str, label: str) -> list[str]:
    # The wordmark leaf is a curve and is not part of the mark.
    found = [d for d in PATH_RE.findall(text) if "C" not in d and "c" not in d]
    assert len(found) == 3, f"{label} should contain stems, diagonal, and cap"
    return found


def test_derived_marks_match_mark_svg():
    source = _paths(MARK_SVG.read_text(encoding="utf-8"), "mark.svg")
    assert source[0].count("M") == 2, "two stems"
    assert source[1].count("M") == 1, "one diagonal"
    assert source[2].count("M") == 1, "orange cap is one square"
    assert _paths(BRAND_MARK_TSX.read_text(encoding="utf-8"), "BrandMark.tsx") == source
    for name in DERIVED:
        assert _paths((BRAND / name).read_text(encoding="utf-8"), name) == source
    assert _paths(APP_ICON.read_text(encoding="utf-8"), "app/icon.svg") == source


def test_app_icon_and_avatar_keep_locked_fills():
    app_icon = (BRAND / "app-icon.svg").read_text(encoding="utf-8")
    assert 'rx="8"' in app_icon
    assert 'fill="#123B32"' in app_icon
    assert 'fill="#20B486"' in app_icon
    assert 'fill="#0F6E4F"' in app_icon
    assert 'fill="#FF793F"' in app_icon
    avatar = (BRAND / "avatar-circle.svg").read_text(encoding="utf-8")
    assert "<circle" in avatar and 'fill="#123B32"' in avatar
    assert 'fill="#FF793F"' in avatar
    forest = (BRAND / "mark-forest.svg").read_text(encoding="utf-8")
    assert 'fill="#20B486"' in forest and 'fill="#FF793F"' in forest
    ink = (BRAND / "mark-ink.svg").read_text(encoding="utf-8")
    assert 'fill="#14171A"' in ink
    assert "#FF793F" not in ink and "#20B486" not in ink


def test_raster_icons_match_mark_svg():
    """PNG icons are regenerated from mark.svg, not hand-edited."""
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    import sync_brand_mark

    stems, diagonal, cap = _paths(MARK_SVG.read_text(encoding="utf-8"), "mark.svg")
    expected = {
        APP / "apple-icon.png": sync_brand_mark.render_tile(stems, diagonal, cap, 180),
        BRAND / "icon-192.png": sync_brand_mark.render_tile(
            stems, diagonal, cap, 192, radius=8
        ),
        BRAND / "icon-512.png": sync_brand_mark.render_tile(
            stems, diagonal, cap, 512, radius=8
        ),
        BRAND / "icon-maskable-512.png": sync_brand_mark.render_tile(
            stems, diagonal, cap, 512, mark_scale=sync_brand_mark.MASKABLE_SCALE
        ),
    }
    for path, image in expected.items():
        actual = Image.open(path).convert("RGBA")
        diff = ImageChops.difference(actual, image.convert("RGBA"))
        assert diff.getbbox() is None, f"{path.name} drifted from mark.svg"
