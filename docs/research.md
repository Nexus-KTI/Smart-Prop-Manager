# Smart Prop — Product Research

**Role:** Product strategist + UX researcher  
**Compiled:** 2026-08-04  
**Method:** Benchmark competitors; do not copy wording, chrome, or identity.  
**Sources:** [`rentora-audit.md`](rentora-audit.md) · [`rentora-authenticated-audit.md`](rentora-authenticated-audit.md) · [`rentora-demo-audit.md`](rentora-demo-audit.md) · [`our-app-authenticated-audit.md`](our-app-authenticated-audit.md) · [`gap-analysis.md`](gap-analysis.md) · [`logo-exploration.md`](logo-exploration.md) (methodology only)

---

## 1. Positioning

| | Rentora (benchmark) | Smart Prop (ours) |
|--|---------------------|-------------------|
| Market | UK landlords / agents; subscription landlord product | Lagos / NG landlords managing rent via Excel + WhatsApp |
| Core object | Property → **Tenancy** hub | Property → **Unit** (tenant fields on the unit) |
| Money | Card collection + email “money in” | Manual cash/transfer log + Paystack + PDF receipt |
| Chase | Email/SMS matrix; tenant app | Single preferred channel (SMS / WhatsApp / Email) outbound |
| Access | Hard paywall before landlord product | Free first-run; invite-only signup optional |
| Brand | Blue `#3183c8`, Noto/Nunito | Forest `--accent`, Geist Sans + JetBrains Mono data |

**Thesis:** Successful rent tools reduce reconciliation between spreadsheet, chat, and bank. Smart Prop wins by being the single unit list where payment history and reminders already live — not by mirroring UK tenancy/compliance stacks.

---

## 2. Landlord jobs-to-be-done

1. **Know who owes** — per flat, without opening Excel + WhatsApp.
2. **Log money when it arrives** — cash or transfer, with proof later.
3. **Chase politely and consistently** — same message, logged, not rewritten each month.
4. **Prove history** — receipt / ledger when a tenant asks “what have I paid?”
5. **Start fast** — first property and unit without a sales call or card wall.

Secondary (not v1): agents managing many landlords, compliance docs, tenant self-serve portals.

---

## 3. What successful products share (patterns to keep)

Drawn from Rentora marketing + demo + our audits — **patterns**, not clones:

| Pattern | Why it works | Smart Prop application |
|---------|--------------|------------------------|
| Clear primary CTA per screen | Reduces decision paralysis | One next action: Add property / Add unit / Record payment / Send reminder |
| Short empty states + single CTA | Recover from zero state | `.dashboard-empty` + checklist on first-run |
| Money-in feedback to landlord | Trust that the system saw the payment | Landlord email on paid + tenant channel receipt |
| Structured address entry | Fewer bad records | Photon autocomplete + optional lat/lng |
| Checklist after login (demo) | Teaches the happy path | Onboarding wizard + Properties checklist when empty |
| Consistent visual system | Premium without noise | Tokens only; no second brand color |
| Price/included clarity (marketing) | Trust | Free/landlord-first story; one price story if/when paid |

---

## 4. Happy paths compared

**Rentora (demo):** Property → Tenancy → Invite tenant → Fees → Documents → Inventory → Payments + email.

**Smart Prop (v1):** Property → Unit (tenant WhatsApp + rent + due day) → Record manual / Paystack → PDF receipt + channel notify → Send WhatsApp/SMS reminder from unit.

Implication: we optimize the **unit hub** (payments + reminders), not a tenancy mega-hub.

---

## 5. Trust signals that matter here

For cash + WhatsApp landlords, “premium” means:

- History that matches reality (PAID / OVERDUE badges that stay correct).
- Receipts that open/download reliably.
- Reminder failures that explain and allow retry.
- OTP copy that matches the real channel (`NEXT_PUBLIC_AUTH_OTP_CHANNEL`).
- No surprise paywall before the first property.

Marketing trust: plain problem language (Excel vs WhatsApp mismatch), WhatsApp callback, forest brand — not blue UK corporate.

---

## 6. Empty states, CTAs, notifications (research takeaways)

- **Empty:** Rentora’s “There’s nothing here!” + one button outperforms vague loading or orphaned Skip states. Unit-less properties must remain visible.
- **CTA hierarchy:** For landlords logging cash, **Record manual payment** should not sit behind Paystack as the visual primary.
- **Notifications:** Event × channel matrices are powerful but heavy. Single preferred channel is enough for v1; expand only with demand.
- **Recovery:** Failed outbound rows without Retry are dead ends — treat as a core UX gap, not a polish item.

---

## 7. Peer context (positioning only)

Beyond Rentora, the local workflow competitors are often **Excel + WhatsApp + bank alerts**, not another SaaS. Differentiation is:

- Unit-centric list as source of truth.
- Outbound reminders on the landlord’s preferred channel.
- Manual payment first-class (cash culture).
- Free path to first value.

Do not position as “Nigerian Rentora” or “UK compliance lite.”

---

## 8. Differentiation — Smart Prop

**We are:** A free landlord tool that turns each flat into a working list: rent, tenant contact, payments, reminders, receipts — so Excel and chat stop disagreeing.

**We are not:** A tenant social app, a UK tenancy/compliance suite, a fee/inventory system, or a hard-gated subscription demo.

| Pillar | Detail |
|--------|--------|
| Unit hub | Payments + reminders answer what / next / log / recovery |
| Free first-run | Wizard + checklist; no card wall |
| Dual money path | Manual primary for cash; Paystack available |
| Channel notify | SMS / WhatsApp / Email preference |
| Brand | Forest tokens, Geist, mono for money dates |

---

## 9. Anti-goals (explicit)

Do **not**:

- Copy Rentora blue, Noto/Nunito, logo, or paywall.
- Add tenancy entity, fees, room inventory, or tenant login without validated demand ([`gap-analysis.md`](gap-analysis.md)).
- Rebuild as a consulting megasite / NestJS / glassmorphism stack from [`logo-exploration.md`](logo-exploration.md) — that file is **methodology**, not product scope.
- Expand notification matrices or global search until portfolio size or users ask.
- Let layout/feature work skip the PRD when changing product scope (chrome-only work may use [`layout-upgrade-prompts.md`](layout-upgrade-prompts.md)).

---

## 10. Evidence gaps

- Rentora landlord product UI was incomplete while unsubscribed; demo video carries most landlord-flow detail.
- Smart Prop authenticated audit is dated 2026-07-31; several adopt-now items (autocomplete, landlord email, unit-less properties, OTP channel helpers) landed afterward — treat as **harden**, not rediscover.
- No formal user interviews yet; JTBD above are inferred from audits + marketing problem statements.

---

## Next artifact

→ [`PRD.md`](PRD.md) — product requirements and roadmap locked to these conclusions.
