# Nexora brand assets

**Approved mark:** the N in [`mark.svg`](mark.svg) (stems, diagonal, orange cap). That file is the only geometry. After editing it, run `python scripts/sync_brand_mark.py` so the copies below stay in sync.

| File | Use |
|------|-----|
| `mark.svg` | Source geometry. Fills: `#20B486`, `#0F6E4F`, `#FF793F` |
| `mark-forest.svg` | Same three fills, no tile |
| `mark-ink.svg` | Ink mono `#14171A` (no orange) |
| `app-icon.svg` | Deep-green tile `#123B32`, radius 8. `web/app/icon.svg` is the same tile. |
| `avatar-circle.svg` | WhatsApp / circular, same tile colour |
| `icon-192.png`, `icon-512.png` | Web app manifest (rounded tile) |
| `icon-maskable-512.png` | Android maskable icon (full bleed, mark at 75%) |

The sync script also writes `web/app/favicon.ico` (16/32/48) and `web/app/apple-icon.png` (180, full bleed). The link preview `web/app/opengraph-image.png` comes from `node scripts/render-og-image.mjs` in `web/`.

Lockups: **Mark** = these files · **Product** = Mark + “nexora” · **Auth** = Product + by KTI · **Full** = Auth + tagline (marketing).

See `docs/nexora-logo-revision-note.md`.
