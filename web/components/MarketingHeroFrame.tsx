"use client";

import { ChevronRight } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { BRAND_NAME } from "@/lib/brand";
import { formatDueDate, formatNaira } from "@/lib/dashboard";

type RowStatus = "overdue" | "paid" | "due-soon";
type Lens = "money" | "ops" | "access";

type LensDetail = {
  kicker: string;
  headline: string;
  body: string;
  primaryChip: string;
  secondaryChip: string;
};

type DemoRow = {
  id: string;
  unit: string;
  tenant: string;
  rent: number;
  due: Date;
  status: RowStatus;
  lenses: Record<Lens, LensDetail>;
};

const LENSES: { id: Lens; label: string }[] = [
  { id: "money", label: "Money" },
  { id: "ops", label: "Ops" },
  { id: "access", label: "Access" },
];

/** Three units - enough to prove the OS, short enough for the hero. */
const ROWS: DemoRow[] = [
  {
    id: "cedar",
    unit: "Cedar · Flat 7",
    tenant: "Williams",
    rent: 1_500_000,
    due: new Date(2026, 6, 3),
    status: "overdue",
    lenses: {
      money: {
        kicker: "What’s next",
        headline: formatNaira(1_500_000),
        body: "WhatsApp reminder - last send failed once.",
        primaryChip: "Remind",
        secondaryChip: "Mark paid",
      },
      ops: {
        kicker: "Work order",
        headline: "WO-184 · Plumber",
        body: "Low pressure. Artisan invited - awaiting claim.",
        primaryChip: "Assign",
        secondaryChip: "Message",
      },
      access: {
        kicker: "Gate pass",
        headline: "Guest · Today",
        body: "Code 7A41 for plumber. Revoke after job.",
        primaryChip: "Revoke",
        secondaryChip: "Extend",
      },
    },
  },
  {
    id: "palm",
    unit: "Palm Court · 2",
    tenant: "Ada Okonkwo",
    rent: 850_000,
    due: new Date(2026, 7, 15),
    status: "paid",
    lenses: {
      money: {
        kicker: "What’s next",
        headline: formatNaira(850_000),
        body: "Receipt is on the unit.",
        primaryChip: "Receipt",
        secondaryChip: "Message",
      },
      ops: {
        kicker: "Renewal",
        headline: "Term ends 30 Nov",
        body: "Checklist clear. Offer renewal this week.",
        primaryChip: "Renew",
        secondaryChip: "Docs",
      },
      access: {
        kicker: "Gate pass",
        headline: "Occupant · Active",
        body: "Primary pass on file. No guest codes open.",
        primaryChip: "Issue guest",
        secondaryChip: "History",
      },
    },
  },
  {
    id: "ikeja",
    unit: "Ikeja · B3",
    tenant: "Sola Mensah",
    rent: 720_000,
    due: new Date(2026, 8, 1),
    status: "due-soon",
    lenses: {
      money: {
        kicker: "What’s next",
        headline: formatNaira(720_000),
        body: "Nudge before due day.",
        primaryChip: "Schedule",
        secondaryChip: "Remind",
      },
      ops: {
        kicker: "Docs",
        headline: "2 awaiting ack",
        body: "House rules not acknowledged yet.",
        primaryChip: "Nudge",
        secondaryChip: "Open docs",
      },
      access: {
        kicker: "Gate pass",
        headline: "Viewing · Sat",
        body: "Temporary code - auto-expires after walkthrough.",
        primaryChip: "Share",
        secondaryChip: "Revoke",
      },
    },
  },
];

const LABEL: Record<RowStatus, string> = {
  overdue: "OVERDUE",
  paid: "PAID",
  "due-soon": "DUE SOON",
};

const IDLE_MS = 4200;
const RESUME_AFTER_INTERACT_MS = 8000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function UnitRow({
  row,
  active,
  onSelect,
}: {
  row: DemoRow;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="marketing-hero-frame-row"
        data-active={active ? "true" : undefined}
        data-status={row.status}
        aria-pressed={active}
        aria-label={`${row.unit}, ${LABEL[row.status]}, ${formatNaira(row.rent)}`}
        onClick={() => onSelect(row.id)}
      >
        <span className="marketing-hero-frame-row-signal" aria-hidden />
        <span className="marketing-hero-frame-row-copy">
          <span className="marketing-hero-frame-unit">{row.unit}</span>
          <span className="marketing-hero-frame-tenant">{row.tenant}</span>
        </span>
        <span className={`status-badge ${row.status}`} aria-hidden>
          {LABEL[row.status]}
        </span>
        <ChevronRight
          className="marketing-hero-frame-chevron"
          size={14}
          aria-hidden
        />
      </button>
    </li>
  );
}

/**
 * Compact Estate OS proof: Money / Ops / Access on three units.
 * No infinite stroll - height stays matched to hero copy.
 */
export function MarketingHeroFrame() {
  const [activeId, setActiveId] = useState(ROWS[0].id);
  const [lens, setLens] = useState<Lens>("money");
  const pauseUntilRef = useRef(0);
  const tickRef = useRef(0);
  const detailId = useId();
  const panelId = useId();
  const active = ROWS.find((r) => r.id === activeId) ?? ROWS[0];
  const detail = active.lenses[lens];

  const selectRow = useCallback((id: string, fromUser = false) => {
    setActiveId(id);
    if (fromUser) {
      pauseUntilRef.current = Date.now() + RESUME_AFTER_INTERACT_MS;
    }
  }, []);

  const selectLens = useCallback((next: Lens, fromUser = false) => {
    setLens(next);
    if (fromUser) {
      pauseUntilRef.current = Date.now() + RESUME_AFTER_INTERACT_MS;
    }
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      tickRef.current += 1;
      if (tickRef.current % 3 === 0) {
        setLens((current) => {
          const idx = LENSES.findIndex((l) => l.id === current);
          return LENSES[(idx + 1) % LENSES.length].id;
        });
        return;
      }
      setActiveId((current) => {
        const idx = ROWS.findIndex((r) => r.id === current);
        return ROWS[(idx + 1) % ROWS.length].id;
      });
    }, IDLE_MS);
    return () => window.clearInterval(timer);
  }, []);

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const idx = ROWS.findIndex((r) => r.id === activeId);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectRow(ROWS[(idx + 1) % ROWS.length].id, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectRow(ROWS[(idx - 1 + ROWS.length) % ROWS.length].id, true);
    }
  }

  function onLensKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const idx = LENSES.findIndex((l) => l.id === lens);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectLens(LENSES[(idx + 1) % LENSES.length].id, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectLens(LENSES[(idx - 1 + LENSES.length) % LENSES.length].id, true);
    }
  }

  function pauseDemo() {
    pauseUntilRef.current = Date.now() + RESUME_AFTER_INTERACT_MS;
  }

  const lensMeta = LENSES.find((l) => l.id === lens)?.label ?? "Money";

  return (
    <div
      className="marketing-hero-product-stage"
      data-status={active.status}
      data-lens={lens}
      onPointerEnter={pauseDemo}
      aria-label={`${BRAND_NAME} Estate OS preview`}
    >
      <div className="marketing-hero-frame marketing-hero-frame--compact marketing-hero-frame--elevated">
        <div className="marketing-hero-frame-chrome">
          <span className="marketing-hero-frame-chrome-title">{BRAND_NAME}</span>
          <span className="marketing-hero-frame-chrome-meta" aria-hidden>
            Estate OS · {lensMeta}
          </span>
        </div>

        <div
          className="marketing-hero-frame-lenses"
          role="tablist"
          aria-label="Estate OS lens"
          onKeyDown={onLensKeyDown}
        >
          {LENSES.map((item) => (
            <button
              key={item.id}
              type="button"
              id={`${panelId}-tab-${item.id}`}
              role="tab"
              className="marketing-hero-frame-lens"
              aria-selected={lens === item.id}
              aria-controls={panelId}
              tabIndex={lens === item.id ? 0 : -1}
              data-active={lens === item.id ? "true" : undefined}
              onClick={() => selectLens(item.id, true)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="marketing-hero-frame-split">
          <div className="marketing-hero-frame-pane">
            <ul
              className="marketing-hero-frame-list"
              aria-label="Sample units"
              aria-describedby={detailId}
              onKeyDown={onListKeyDown}
              onPointerDown={pauseDemo}
            >
              {ROWS.map((row) => (
                <UnitRow
                  key={row.id}
                  row={row}
                  active={row.id === activeId}
                  onSelect={(id) => selectRow(id, true)}
                />
              ))}
            </ul>
          </div>

          <aside
            key={`${active.id}-${lens}`}
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${panelId}-tab-${lens}`}
            className="marketing-hero-chase"
            data-status={active.status}
            data-lens={lens}
            aria-live="polite"
          >
            <p className="marketing-hero-chase-kicker">{detail.kicker}</p>
            <p className="marketing-hero-chase-unit" id={detailId}>
              {active.unit}
            </p>
            <p className="marketing-hero-chase-tenant">
              {active.tenant}
              {lens === "money" ? (
                <>
                  <span className="marketing-hero-chase-sep">·</span>
                  due {formatDueDate(active.due)}
                </>
              ) : null}
            </p>
            <p
              className={
                lens === "money"
                  ? "marketing-hero-chase-amount mono-data"
                  : "marketing-hero-chase-amount"
              }
            >
              {detail.headline}
            </p>
            {lens === "money" ? (
              <span className={`status-badge ${active.status}`}>
                {LABEL[active.status]}
              </span>
            ) : null}
            <p className="marketing-hero-chase-action">{detail.body}</p>
            <div className="marketing-hero-chase-chips" aria-hidden>
              <span className="marketing-hero-chase-chip" data-tone="accent">
                {detail.primaryChip}
              </span>
              <span className="marketing-hero-chase-chip">
                {detail.secondaryChip}
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
