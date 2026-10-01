# Nexora brand assets

**Approved mark:** ledger N in [`mark.svg`](mark.svg). That file is the only geometry. After editing it, run `python scripts/sync_brand_mark.py` so the copies below stay in sync.

| File | Use |
|------|-----|
| `mark.svg` | Product mark, `currentColor` |
| `mark-forest.svg` | Forest fill `#0F6E4F` |
| `mark-ink.svg` | Ink mono `#14171A` |
| `app-icon.svg` | Favicon / store tile (flat forest, white mark, radius 8). `web/app/icon.svg` is the same tile. |
| `avatar-circle.svg` | WhatsApp / circular |
| `icon-192.png`, `icon-512.png` | Web app manifest (rounded tile) |
| `icon-maskable-512.png` | Android maskable icon (full bleed, mark at 75%) |

The sync script also writes `web/app/favicon.ico` (16/32/48) and `web/app/apple-icon.png` (180, full bleed). The link preview `web/app/opengraph-image.png` comes from `node scripts/render-og-image.mjs` in `web/`.

Lockups: **Mark** = these files · **Product** = Mark + “Nexora” · **Full** = Product + tagline + by KTI (marketing only).

See `docs/nexora-logo-revision-note.md`.
