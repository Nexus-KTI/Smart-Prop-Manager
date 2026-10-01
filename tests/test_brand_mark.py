"""The ledger-N path in mark.svg is the only mark geometry."""

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
APP_ICON = ROOT / "web" / "app" / "icon.svg"

PATH_RE = re.compile(r'\sd="([^"]+)"')


def _d(text: str, label: str) -> str:
    found = PATH_RE.findall(text)
    assert len(found) == 1, f"{label} should contain exactly one path d"
    return found[0]


def test_derived_marks_match_mark_svg():
    source = _d(MARK_SVG.read_text(encoding="utf-8"), "mark.svg")
    assert source.count("M") == 5, "ledger N = diagonal + 4 stem pieces, non-overlapping"

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


def test_raster_icons_match_mark_svg():
    """PNG/ICO icons are regenerated from mark.svg, not hand-edited."""
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    import sync_brand_mark

    d = _d(MARK_SVG.read_text(encoding="utf-8"), "mark.svg")
    expected = {
        APP / "apple-icon.png": sync_brand_mark.render_tile(d, 180),
        BRAND / "icon-192.png": sync_brand_mark.render_tile(d, 192, radius=8),
        BRAND / "icon-512.png": sync_brand_mark.render_tile(d, 512, radius=8),
        BRAND / "icon-maskable-512.png": sync_brand_mark.render_tile(
            d, 512, mark_scale=sync_brand_mark.MASKABLE_SCALE
        ),
    }
    for path, image in expected.items():
        on_disk = Image.open(path).convert("RGBA")
        assert on_disk.size == image.size, path.name
        # Tolerate anti-aliasing differences between Pillow versions; a moved cut
        # flips thousands of pixels at full contrast.
        diff = ImageChops.difference(on_disk, image).convert("L")
        changed = sum(diff.point(lambda v: 255 if v > 64 else 0).histogram()[255:])
        assert changed < image.width * image.height * 0.001, (
            f"{path.name} drifted; run python scripts/sync_brand_mark.py"
        )

    favicon = Image.open(APP / "favicon.ico")
    assert favicon.info["sizes"] == {(16, 16), (32, 32), (48, 48)}


def test_link_preview_image_is_wired_at_root():
    preview = Image.open(APP / "opengraph-image.png")
    assert preview.size == (1200, 630)
    assert (APP / "opengraph-image.png").stat().st_size < 300_000, "WhatsApp drops large previews"
    assert (APP / "opengraph-image.alt.txt").read_text(encoding="utf-8").strip()

    # A child openGraph block replaces the root one and drops opengraph-image.png.
    offenders = [
        str(path.relative_to(APP))
        for path in APP.rglob("*.tsx")
        if path != APP / "layout.tsx" and "openGraph" in path.read_text(encoding="utf-8")
    ]
    assert offenders == []
