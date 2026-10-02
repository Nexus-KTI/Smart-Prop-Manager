"""Rewrite derived Nexora marks from web/public/brand/mark.svg.

The path `d` values in mark.svg are the only geometry. BrandMark stays an
inline SVG painted with --mark, --mark-deep, and --brand. Raster icons
(favicon.ico, apple-icon.png, manifest PNGs) are drawn from the same paths.
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

GREEN = "#20B486"
DEEP = "#123B32"
FACE = "#0F6E4F"
INK = "#14171A"
ORANGE = "#FF793F"

GRID = 32
SUPERSAMPLE = 8
# Maskable icons must keep the mark inside the central 80% circle.
MASKABLE_SCALE = 0.75


def mark_paths(svg_text: str) -> tuple[str, str, str]:
    found = PATH_RE.findall(svg_text)
    if len(found) != 3:
        raise SystemExit(f"Expected stems, diagonal, and cap in {MARK_SVG}")
    return found[0], found[1], found[2]


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


def _colored(stems: str, diagonal: str, cap: str) -> str:
    return (
        _path(GREEN, stems)
        + "\n"
        + _path(FACE, diagonal)
        + "\n"
        + _path(ORANGE, cap)
    )


def _mono(stems: str, diagonal: str, cap: str) -> str:
    return (
        _path(INK, stems) + "\n" + _path(INK, diagonal) + "\n" + _path(INK, cap)
    )


def _app_icon(stems: str, diagonal: str, cap: str) -> str:
    return _svg(
        f'  <rect width="32" height="32" rx="8" fill="{DEEP}"/>\n'
        + _colored(stems, diagonal, cap)
    )


def derived_svgs(stems: str, diagonal: str, cap: str) -> dict[Path, str]:
    return {
        BRAND_DIR / "mark-forest.svg": _svg(_colored(stems, diagonal, cap)),
        BRAND_DIR / "mark-ink.svg": _svg(_mono(stems, diagonal, cap)),
        BRAND_DIR / "app-icon.svg": _app_icon(stems, diagonal, cap),
        BRAND_DIR / "avatar-circle.svg": _svg(
            f'  <circle cx="16" cy="16" r="16" fill="{DEEP}"/>\n'
            + _colored(stems, diagonal, cap)
        ),
        ROOT / "web" / "app" / "icon.svg": _app_icon(stems, diagonal, cap),
    }


def sync_brand_mark_tsx(stems: str, diagonal: str, cap: str) -> None:
    text = BRAND_MARK_TSX.read_text(encoding="utf-8")
    # The wordmark leaf is a curve; the N is straight segments only.
    found = [d for d in PATH_RE.findall(text) if "C" not in d and "c" not in d]
    if len(found) != 3:
        raise SystemExit(f"Expected stems, diagonal, and cap in {BRAND_MARK_TSX}")
    for old, new in zip(found, (stems, diagonal, cap)):
        text = text.replace(f'd="{old}"', f'd="{new}"', 1)
    BRAND_MARK_TSX.write_text(text, encoding="utf-8", newline="\n")


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


def _draw_mark(
    draw: ImageDraw.ImageDraw,
    polygons: list[list[tuple[float, float]]],
    *,
    unit: float,
    mark_scale: float,
    fill: str,
) -> None:
    center = GRID / 2
    for polygon in polygons:
        draw.polygon(
            [
                (
                    (center + (px_ - center) * mark_scale) * unit,
                    (center + (py_ - center) * mark_scale) * unit,
                )
                for px_, py_ in polygon
            ],
            fill=fill,
        )


def render_tile(
    stems: str,
    diagonal: str,
    cap: str,
    px: int,
    *,
    radius: float = 0,
    mark_scale: float = 1.0,
) -> Image.Image:
    """Coloured N on a deep-green tile."""
    big = px * SUPERSAMPLE
    unit = big / GRID
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=radius * unit, fill=DEEP
    )
    _draw_mark(draw, mark_polygons(stems), unit=unit, mark_scale=mark_scale, fill=GREEN)
    _draw_mark(
        draw, mark_polygons(diagonal), unit=unit, mark_scale=mark_scale, fill=GREEN
    )
    _draw_mark(draw, mark_polygons(cap), unit=unit, mark_scale=mark_scale, fill=ORANGE)
    return image.resize((px, px), Image.Resampling.LANCZOS)


def write_rasters(stems: str, diagonal: str, cap: str) -> None:
    favicon_sizes = (16, 32, 48)
    favicons = [
        render_tile(stems, diagonal, cap, size, radius=8) for size in favicon_sizes
    ]
    favicons[-1].save(
        APP_DIR / "favicon.ico",
        format="ICO",
        sizes=[(size, size) for size in favicon_sizes],
        append_images=favicons[:-1],
    )
    # iOS masks the corners itself, so the apple icon is a full-bleed square.
    render_tile(stems, diagonal, cap, 180).save(APP_DIR / "apple-icon.png", optimize=True)
    render_tile(stems, diagonal, cap, 192, radius=8).save(
        BRAND_DIR / "icon-192.png", optimize=True
    )
    render_tile(stems, diagonal, cap, 512, radius=8).save(
        BRAND_DIR / "icon-512.png", optimize=True
    )
    render_tile(stems, diagonal, cap, 512, mark_scale=MASKABLE_SCALE).save(
        BRAND_DIR / "icon-maskable-512.png", optimize=True
    )


def main() -> None:
    stems, diagonal, cap = mark_paths(MARK_SVG.read_text(encoding="utf-8"))
    for path, body in derived_svgs(stems, diagonal, cap).items():
        path.write_text(body, encoding="utf-8", newline="\n")
    sync_brand_mark_tsx(stems, diagonal, cap)
    write_rasters(stems, diagonal, cap)


if __name__ == "__main__":
    main()
    sys.exit(0)
