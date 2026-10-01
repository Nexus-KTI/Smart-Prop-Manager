"""Rewrite derived Nexora marks from web/public/brand/mark.svg.

The path `d` in mark.svg is the only geometry. BrandMark stays an inline SVG
so the sidebar can paint it with currentColor.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARK_SVG = ROOT / "web" / "public" / "brand" / "mark.svg"
BRAND_DIR = MARK_SVG.parent
BRAND_MARK_TSX = ROOT / "web" / "components" / "BrandMark.tsx"

PATH_RE = re.compile(r'\sd="([^"]+)"')

FOREST = "#0F6E4F"
INK = "#14171A"
WHITE = "#FFFFFF"


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


def main() -> None:
    d = mark_d(MARK_SVG.read_text(encoding="utf-8"))
    for path, body in derived_svgs(d).items():
        path.write_text(body, encoding="utf-8", newline="\n")
    sync_brand_mark_tsx(d)


if __name__ == "__main__":
    main()
    sys.exit(0)
