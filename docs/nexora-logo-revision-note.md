# Nexora logo — lock decision

**Status:** Approved — **ship Option B (Ledger / Unit)**  
**Product name:** Nexora (never “Smart Prop Manager”)  
**Parent:** by KTI · orange stamp only `#E65100`

---

## Symbol decision

| Option | Role |
|--------|------|
| **A** Baseline bars | Fallback if B fails at ≤16px |
| **B** Ledger / unit | **Primary — ship this** |
| **C** Distinctive block | Deck-only optional; not product chrome |

**Why B:** Money-truth signal (who paid / who owes) without house clipart; more distinctive than generic fintech bars.

---

## Lockups (locked)

| Lockup | Contents | Use |
|--------|----------|-----|
| **Full** | Mark + Nexora + tagline + by KTI | Marketing, pitch, investor one-pager |
| **Product** | Mark + Nexora | App shell, auth, emails |
| **Mark** | Mark alone | Favicon, collapsed sidebar, WhatsApp, store |

Tagline + by KTI never in product chrome.

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

## Still needed from designer (source)

1. Final **SVG** for Option B (outline + filled) + wordmark outlines  
2. Proven **16×16** crop of B (ledger lines still read)  
3. PNG @1x/2x/3x + 1024 app icon  

Until then: engineering uses preview B in `web/public/brand/` + `BrandMark.tsx` (swap files in place when finals arrive).

---

## Engineering

- Paths: `BRAND_ASSETS` in `web/lib/brand.ts`  
- Collapsed sidebar mark: `--accent` (forest), not orange  
- Option A archive: `web/public/brand/mark-option-a.svg`
