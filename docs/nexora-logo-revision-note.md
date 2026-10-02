# Nexora logo — lock decision

**Status:** Shipped — N mark, leaf wordmark, brand-board palette  
**Product name:** Nexora (never “Smart Prop Manager”)  
**Parent:** by KTI · orange stamp `#FF793F` on marketing and auth only

---

## Symbol

The product mark is an N: a short left stem, a deep diagonal, a tall right stem, and an orange cap on the tall stem. Geometry lives only in `web/public/brand/mark.svg` (stems, then diagonal, then cap). `scripts/sync_brand_mark.py` copies those three paths into `BrandMark` and the filled SVGs. In the app the stems use `--mark` (`#20B486`), the diagonal uses `--mark-deep` (`#0F6E4F`), and the cap uses `--brand` (`#FF793F`).

The wordmark is lowercase **nexora** with a green leaf in the counter of the o (`BrandWordmark`). The word is `--ink`.

The ledger N, three rising bars, house clipart, and a solid N are not the product mark.

---

## Lockups (locked)

| Lockup | Contents | Use |
|--------|----------|-----|
| **Full** | Mark + nexora + tagline + by KTI | Marketing, pitch, investor one-pager |
| **Auth** | Mark + nexora + by KTI stamp | Login, signup, onboarding, claim |
| **Product** | Mark + nexora | App shells (landlord, tenant, artisan, admin) |
| **Mark** | Mark alone | Favicon, collapsed sidebar, WhatsApp, store |

Tagline: “Property management made simple.” The expanded product sidebar shows that line in the footer, split as “Smarter property management” / “Made simple.” The collapsed rail shows the mark only. The admin sidebar shows **ADMIN** beside the word, with no stamp.

**Wordmark case:** the logo renders lowercase **nexora**. Copy, emails, receipts, titles, and legal text keep **Nexora**.

---

## Colors (locked)

| Token | Hex | Role |
|-------|-----|------|
| Nexora green | `#20B486` | Mark stems, wordmark leaf. Dark-app actions. |
| Deep green | `#123B32` | App-icon tile, dark `--accent-soft` |
| Forest | `#0F6E4F` | Light-app actions (readable on white). Diagonal of the N. |
| Accent orange | `#FF793F` | Cap, `by KTI` stamp, dark-app alerts |
| Charcoal | `#101416` | Dark canvas |
| Slate | `#6B7280` | Secondary text |
| Snow | `#F1F5F4` | Dark headings / `--ink` |
| Ink | `#14171A` | Light text, mono mark |

Light alerts stay `#C2410C` so small overdue text stays readable. Flat marks only — no shadows, glows, or gradients on icons.

---

## Engineering

- Source path: `web/public/brand/mark.svg`
- Derived files: `mark-forest.svg`, `mark-ink.svg`, `app-icon.svg`, `avatar-circle.svg`, `web/app/icon.svg`
- Paths: `BRAND_ASSETS` in `web/lib/brand.ts`
- Drift check: `tests/test_brand_mark.py`
