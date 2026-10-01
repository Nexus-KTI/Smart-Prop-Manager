# Nexora logo — lock decision

**Status:** Shipped — ledger N  
**Product name:** Nexora (never “Smart Prop Manager”)  
**Parent:** by KTI · orange stamp only `#E65100`

---

## Symbol

The product mark is a capital N with two horizontal ledger cuts. Geometry lives only in `web/public/brand/mark.svg`. `scripts/sync_brand_mark.py` copies that path into `BrandMark` and the filled SVGs.

House clipart, a solid N, and the archived slanted-bar mark are not the product mark.

---

## Lockups (locked)

| Lockup | Contents | Use |
|--------|----------|-----|
| **Full** | Mark + Nexora + tagline + by KTI | Marketing, pitch, investor one-pager |
| **Product** | Mark + Nexora + by KTI stamp | App shell, auth |
| **Mark** | Mark alone | Favicon, collapsed sidebar, WhatsApp, store |

The tagline stays on marketing. The expanded sidebar shows the orange **by KTI** stamp; the collapsed rail shows the forest mark only.

---

## Colors (locked)

| Token | Hex | Role |
|-------|-----|------|
| Forest | `#0F6E4F` | Product identity |
| Ink | `#14171A` | Mono / dark |
| KTI Orange | `#E65100` | Parent stamp only |
| Canvas | `#F7F8F7` | Light ground |
| Alert | `#B4402A` | Overdue UI only — never in logo |

Flat marks only — no shadows, glows, or gradients on icons.

---

## Engineering

- Source path: `web/public/brand/mark.svg`
- Derived files: `mark-forest.svg`, `mark-ink.svg`, `app-icon.svg`, `avatar-circle.svg`, `web/app/icon.svg`
- Paths: `BRAND_ASSETS` in `web/lib/brand.ts`
- Collapsed sidebar mark: `--accent` (forest), not orange
- Drift check: `tests/test_brand_mark.py`
