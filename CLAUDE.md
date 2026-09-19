# Nexora (Smart Prop Manager) — agent operating context

**Product:** Nexora by KTI — landlord rent-and-chase list for Nigeria (cash, transfer, Paystack, WhatsApp).  
**Stack:** FastAPI (`main.py`, `routers/`, `lib/`) + Next.js (`web/`) + Supabase (Auth, Postgres, Storage).  
**Brand:** `web/lib/brand.ts` · Design: `docs/design-system.md` · PRD: `docs/PRD.md` + `docs/PRD-nexora-estate-os.md`

## How to work here (ADLC-lite)

1. **Spec before code** for multi-file work — update `plans/spec.md` and pick a task from `plans/backlog.md`.
2. **One task, one branch** (prefer a worktree for parallel agents).
3. **Do not invent conventions** — follow existing tokens, classes, routers, and `sql/` numbering.
4. **Done means green** — run targeted tests / lint for the area you touched; do not claim done on red.
5. **Do not commit or push** unless the user explicitly asks.

## Hard constraints

- Colors via CSS tokens only (`--accent`, `--brand`, `--surface`, `--border`, `--ink`, `--muted`, `--background`, `--alert`). Forest green for product actions; KTI orange (`--brand`) for parent stamps/marks only - no Rentora blue, no purple-AI defaults.
- Geist Sans UI; JetBrains Mono via `.mono-data` for amounts/dates.
- Product shell: no decorative box-shadows. Marketing: prefer flat editorial (see design system) over glow stacks / glassmorphism.
- Schema changes live in `sql/` as ordered files; prefer inspect-before-apply (Supabase MCP `list_migrations` / advisors). Never invent US TenantCloud features in copy.
- Estate OS wireframes stay under `web/app/(design)/os-explorer/**` — use `os-*` agents only for that loop. Do not leak mock explorer into production dashboard/API.

## Agent map

| Role | When |
|------|------|
| `os-*` under `.claude/agents/` | Estate OS explorer wireframes only |
| `engineer` | Implement a backlog task against `plans/spec.md` |
| `reviewer` | Diff review: correctness, design tokens, tests, SQL safety |
| `qa` | Smoke / checklist against `docs/*-smoke.md` or stated acceptance |

## Key paths

- API: `main.py`, `routers/`, `lib/`, `tests/`
- Web: `web/app/`, `web/components/`, `web/lib/`
- Migrations: `sql/000_*.sql` … apply in order
- Ops: `docs/ops-checklist.md`, `.env.example`
- Process playbook: `docs/product-prompt-playbook.md`
- Living plan: `plans/spec.md`, `plans/backlog.md`
