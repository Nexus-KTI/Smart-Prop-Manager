"""Rewrite derived Nexora marks from web/public/brand/mark.svg.

The path `d` in mark.svg is the only geometry. BrandMark stays an inline SVG
so the sidebar can paint it with currentColor. Raster icons (favicon.ico,
apple-icon.png, manifest PNGs) are drawn from the same path with Pillow.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MARK_SVG = ROOT / "web" / "public" / "brand" / "mark.svg"
BRAND_DIR = MARK_SVG.parent
APP_DIR = ROOT / "web" / "app"
BRAND_MARK_TSX = ROOT / "web" / "components" / "BrandMark.tsx"

PATH_RE = re.compile(r'\sd="([^"]+)"')
PATH_TOKEN_RE = re.compile(r"[MHVLZ]|-?\d*\.?\d+")

FOREST = "#0F6E4F"
INK = "#14171A"
WHITE = "#FFFFFF"

GRID = 32
SUPERSAMPLE = 8
# Maskable icons must keep the mark inside the central 80% circle.
MASKABLE_SCALE = 0.75


def mark_d(svg_text: str) -> str:
    match = PATH_RE.search(svg_text)
    if not match:
        raise SystemExit(f"No path d in {MARK_SVG}")
    return match.group(1)


def _svg(body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" '
        'fill="none" aria-hidden="true">\n'
        f"{body}\n"
        "</svg>\n"
    )


def _path(fill: str, d: str) -> str:
    return (
        "  <path\n"
        f'    fill="{fill}"\n'
        '    fill-rule="evenodd"\n'
        f'    d="{d}"\n'
        "  />"
    )


def _app_icon(d: str) -> str:
    return _svg(
        f'  <rect width="32" height="32" rx="8" fill="{FOREST}"/>\n' + _path(WHITE, d)
    )


def derived_svgs(d: str) -> dict[Path, str]:
    return {
        BRAND_DIR / "mark-forest.svg": _svg(_path(FOREST, d)),
        BRAND_DIR / "mark-ink.svg": _svg(_path(INK, d)),
        BRAND_DIR / "app-icon.svg": _app_icon(d),
        BRAND_DIR / "avatar-circle.svg": _svg(
            f'  <circle cx="16" cy="16" r="16" fill="{FOREST}"/>\n' + _path(WHITE, d)
        ),
        # Next.js file icon. Same tile as app-icon.svg.
        ROOT / "web" / "app" / "icon.svg": _app_icon(d),
    }


def sync_brand_mark_tsx(d: str) -> None:
    text = BRAND_MARK_TSX.read_text(encoding="utf-8")
    updated, count = PATH_RE.subn(f' d="{d}"', text, count=1)
    if count != 1:
        raise SystemExit(f"Expected one path d in {BRAND_MARK_TSX}")
    BRAND_MARK_TSX.write_text(updated, encoding="utf-8", newline="\n")


def mark_polygons(d: str) -> list[list[tuple[float, float]]]:
    """Absolute M/H/V/L/Z subpaths -> polygons in the 32-unit grid."""
    tokens = PATH_TOKEN_RE.findall(d)
    polygons: list[list[tuple[float, float]]] = []
    points: list[tuple[float, float]] = []
    x = y = 0.0
    i = 0
    while i < len(tokens):
        cmd = tokens[i]
        i += 1
        if cmd in ("M", "L"):
            x, y = float(tokens[i]), float(tokens[i + 1])
            i += 2
            if cmd == "M" and points:
                polygons.append(points)
                points = []
            points.append((x, y))
        elif cmd == "H":
            x = float(tokens[i])
            i += 1
            points.append((x, y))
        elif cmd == "V":
            y = float(tokens[i])
            i += 1
            points.append((x, y))
        elif cmd == "Z":
            polygons.append(points)
            points = []
        else:
            raise SystemExit(f"Unsupported path command {cmd!r} in {MARK_SVG}")
    if points:
        polygons.append(points)
    return polygons


def render_tile(
    d: str, px: int, *, radius: float = 0, mark_scale: float = 1.0
) -> Image.Image:
    """White mark on a forest tile, drawn large then downsampled for clean edges."""
    big = px * SUPERSAMPLE
    unit = big / GRID
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=radius * unit, fill=FOREST
    )
    center = GRID / 2
    for polygon in mark_polygons(d):
        draw.polygon(
            [
                (
                    (center + (px_ - center) * mark_scale) * unit,
                    (center + (py_ - center) * mark_scale) * unit,
                )
                for px_, py_ in polygon
            ],
            fill=WHITE,
        )
    return image.resize((px, px), Image.Resampling.LANCZOS)


def write_rasters(d: str) -> None:
    favicon_sizes = (16, 32, 48)
    favicons = [render_tile(d, size, radius=8) for size in favicon_sizes]
    favicons[-1].save(
        APP_DIR / "favicon.ico",
        format="ICO",
        sizes=[(size, size) for size in favicon_sizes],
        append_images=favicons[:-1],
    )
    # iOS masks the corners itself, so the apple icon is a full-bleed square.
    render_tile(d, 180).save(APP_DIR / "apple-icon.png", optimize=True)
    render_tile(d, 192, radius=8).save(BRAND_DIR / "icon-192.png", optimize=True)
    render_tile(d, 512, radius=8).save(BRAND_DIR / "icon-512.png", optimize=True)
    render_tile(d, 512, mark_scale=MASKABLE_SCALE).save(
        BRAND_DIR / "icon-maskable-512.png", optimize=True
    )


def main() -> None:
    d = mark_d(MARK_SVG.read_text(encoding="utf-8"))
    for path, body in derived_svgs(d).items():
        path.write_text(body, encoding="utf-8", newline="\n")
    sync_brand_mark_tsx(d)
    write_rasters(d)


if __name__ == "__main__":
    main()
    sys.exit(0)
