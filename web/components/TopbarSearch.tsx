"use client";

import { useRouter } from "next/navigation";
import { Building2, DoorOpen, Search, User, Wallet, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { fetchPortfolioPaymentsPage, fetchProperties } from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";
import { fetchPortfolioUnitsCapped } from "@/lib/dashboard-home";
import type { PortfolioPayment, PortfolioUnit, Property } from "@/lib/types";

type SearchIndex = {
  properties: Property[];
  units: PortfolioUnit[];
  payments: PortfolioPayment[];
};

type Result = {
  id: string;
  kind: "property" | "unit" | "tenant" | "payment";
  label: string;
  meta: string;
  href: string;
};

const MAX_RESULTS = 8;
const INDEX_TTL_MS = 60_000;

let cachedIndex: { at: number; promise: Promise<SearchIndex> } | null = null;

function loadIndex(): Promise<SearchIndex> {
  if (cachedIndex && Date.now() - cachedIndex.at < INDEX_TTL_MS) {
    return cachedIndex.promise;
  }
  const promise = Promise.all([
    fetchProperties(),
    fetchPortfolioUnitsCapped(),
    fetchPortfolioPaymentsPage(null).catch(() => ({ items: [], next_cursor: null })),
  ]).then(([properties, units, payments]) => ({
    properties,
    units: units.items,
    payments: payments.items,
  }));
  cachedIndex = { at: Date.now(), promise };
  promise.catch(() => {
    cachedIndex = null;
  });
  return promise;
}

function matches(value: string | null | undefined, query: string): boolean {
  return Boolean(value && value.toLowerCase().includes(query));
}

function search(index: SearchIndex, raw: string): Result[] {
  const query = raw.trim().toLowerCase();
  if (!query) return [];
  const results: Result[] = [];
  for (const property of index.properties) {
    if (matches(property.name, query) || matches(property.address, query)) {
      results.push({
        id: `p-${property.id}`,
        kind: "property",
        label: property.name,
        meta: property.address?.trim() || "Property",
        href: `/properties/${property.id}`,
      });
    }
  }
  for (const item of index.units) {
    const tenant = item.unit.tenant_name?.trim();
    if (tenant && matches(tenant, query)) {
      results.push({
        id: `t-${item.unit.id}`,
        kind: "tenant",
        label: tenant,
        meta: `${item.property_name} · ${item.unit.label}`,
        href: `/payments/${item.unit.id}`,
      });
    } else if (matches(item.unit.label, query)) {
      results.push({
        id: `u-${item.unit.id}`,
        kind: "unit",
        label: item.unit.label,
        meta: `${item.property_name} · ${tenant || "Vacant"}`,
        href: `/payments/${item.unit.id}`,
      });
    }
  }
  for (const payment of index.payments) {
    const amount = formatNaira(Number(payment.amount) || 0);
    const digits = String(payment.amount ?? "").replace(/[^\d]/g, "");
    const queryDigits = query.replace(/[^\d]/g, "");
    const amountHit =
      queryDigits.length >= 3 && digits.includes(queryDigits);
    if (
      matches(payment.tenant_name, query) ||
      matches(payment.property_name, query) ||
      matches(payment.unit_label, query) ||
      matches(payment.payment_reference, query) ||
      amountHit
    ) {
      const where = [payment.property_name, payment.unit_label]
        .map((part) => (part || "").trim())
        .filter(Boolean)
        .join(" · ");
      results.push({
        id: `pay-${payment.id}`,
        kind: "payment",
        label: payment.tenant_name?.trim() || "Payment",
        meta: `${amount}${where ? ` · ${where}` : ""}`,
        href: `/payments/${payment.unit_id}`,
      });
    }
  }
  return results.slice(0, MAX_RESULTS);
}

const KIND_ICON = {
  property: Building2,
  unit: DoorOpen,
  tenant: User,
  payment: Wallet,
} as const;

/** Landlord top-bar finder over properties, units, tenants, and recent payments. */
export function TopbarSearch() {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(
    () => (index ? search(index, query) : []),
    [index, query],
  );

  const ensureIndex = useCallback(() => {
    if (index) return;
    setError(false);
    loadIndex()
      .then(setIndex)
      .catch(() => setError(true));
  }, [index]);

  const close = useCallback(() => {
    setOpen(false);
    setExpanded(false);
  }, []);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setExpanded(true);
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open && !expanded) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, expanded, close]);

  function go(result: Result) {
    setQuery("");
    close();
    inputRef.current?.blur();
    router.push(result.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) setQuery("");
      else {
        close();
        inputRef.current?.blur();
      }
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = results[Math.min(activeIndex, results.length - 1)];
      if (pick) go(pick);
    }
  }

  const showPanel = open && query.trim().length > 0;
  const activeId =
    showPanel && results[activeIndex]
      ? `${listId}-${results[activeIndex].id}`
      : undefined;

  return (
    <div className="topbar-search" ref={rootRef} data-expanded={expanded}>
      <button
        type="button"
        className="shell-topbar-icon-btn topbar-search-open"
        aria-label="Search"
        onClick={() => {
          setExpanded(true);
          ensureIndex();
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <Search size={20} strokeWidth={1.75} aria-hidden />
      </button>
      <div className="topbar-search-field">
        <Search
          className="topbar-search-icon"
          size={18}
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          className="topbar-search-input"
          placeholder="Search properties, tenants, or payments…"
          aria-label="Search properties, tenants, or payments"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          value={query}
          onFocus={() => {
            ensureIndex();
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd className="topbar-search-kbd" aria-hidden>
          Ctrl K
        </kbd>
        <button
          type="button"
          className="topbar-search-close"
          aria-label="Close search"
          onClick={() => {
            setQuery("");
            close();
          }}
        >
          <X size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {showPanel ? (
        <div className="topbar-search-panel">
          {error ? (
            <p className="topbar-search-empty">Couldn’t load search. Try again.</p>
          ) : !index ? (
            <p className="topbar-search-empty">Loading your portfolio…</p>
          ) : results.length === 0 ? (
            <p className="topbar-search-empty">No matches for “{query.trim()}”.</p>
          ) : null}
          <ul id={listId} role="listbox" className="topbar-search-list">
            {results.map((result, i) => {
              const Icon = KIND_ICON[result.kind];
              return (
                <li
                  key={result.id}
                  id={`${listId}-${result.id}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className="topbar-search-option"
                  onPointerEnter={() => setActiveIndex(i)}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    go(result);
                  }}
                >
                  <span className="topbar-search-option-icon" aria-hidden>
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <span className="topbar-search-option-text">
                    <span className="topbar-search-option-label">{result.label}</span>
                    <span className="topbar-search-option-meta">{result.meta}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
