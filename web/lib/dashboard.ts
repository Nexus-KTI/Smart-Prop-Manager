import type {
  ChargeLineStatus,
  ChargeType,
  DashboardRow,
  DashboardStats,
  PortfolioUnit,
  Property,
  Transaction,
  Unit,
  UnitStatus,
} from "./types";

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function clampDay(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

/** Current period due date from frequency + due_day (Lagos-local calendar). */
export function dueDateForUnit(
  dueDay: number | null | undefined,
  frequency: Unit["frequency"] | null | undefined = "monthly",
  now: Date = new Date(),
  dueMonth: number | null | undefined = null,
): Date | null {
  if (dueDay == null || dueDay < 1) return null;
  const today = startOfDay(now);
  const freq = frequency || "monthly";

  if (freq === "daily") {
    return today;
  }

  if (freq === "weekly") {
    const target = ((dueDay - 1) % 7 + 7) % 7;
    const current = today.getDay();
    const delta = (target - current + 7) % 7;
    const due = new Date(today);
    due.setDate(today.getDate() + delta);
    return due;
  }

  const year = today.getFullYear();

  if (freq === "annual") {
    const monthIndex = Math.min(11, Math.max(0, (dueMonth ?? 1) - 1));
    const day = clampDay(year, monthIndex, dueDay);
    return startOfDay(new Date(year, monthIndex, day));
  }

  const month = today.getMonth();
  const day = clampDay(year, month, dueDay);
  return startOfDay(new Date(year, month, day));
}

/** Next cycle due date after the current period’s due. */
export function nextDueDateForUnit(
  dueDay: number | null | undefined,
  frequency: Unit["frequency"] | null | undefined = "monthly",
  now: Date = new Date(),
  dueMonth: number | null | undefined = null,
): Date | null {
  const current = dueDateForUnit(dueDay, frequency, now, dueMonth);
  if (!current || dueDay == null || dueDay < 1) return null;
  const freq = frequency || "monthly";

  if (freq === "daily") {
    const d = new Date(current);
    d.setDate(d.getDate() + 1);
    return startOfDay(d);
  }
  if (freq === "weekly") {
    const d = new Date(current);
    d.setDate(d.getDate() + 7);
    return startOfDay(d);
  }
  if (freq === "annual") {
    const monthIndex = Math.min(11, Math.max(0, (dueMonth ?? 1) - 1));
    const nextYear = current.getFullYear() + 1;
    const day = clampDay(nextYear, monthIndex, dueDay);
    return startOfDay(new Date(nextYear, monthIndex, day));
  }

  const nextMonth = current.getMonth() + 1;
  const year = current.getFullYear() + (nextMonth > 11 ? 1 : 0);
  const monthIndex = nextMonth % 12;
  const day = clampDay(year, monthIndex, dueDay);
  return startOfDay(new Date(year, monthIndex, day));
}

function periodStart(
  due: Date,
  frequency: Unit["frequency"] | null | undefined,
): Date {
  const freq = frequency || "monthly";
  const start = startOfDay(due);
  if (freq === "daily") return start;
  if (freq === "weekly") {
    const s = new Date(start);
    s.setDate(s.getDate() - 6);
    return s;
  }
  if (freq === "annual") {
    return startOfDay(new Date(start.getFullYear(), 0, 1));
  }
  return startOfDay(new Date(start.getFullYear(), start.getMonth(), 1));
}

function periodEnd(
  due: Date,
  frequency: Unit["frequency"] | null | undefined,
): Date {
  const freq = frequency || "monthly";
  const end = startOfDay(due);
  if (freq === "daily") return end;
  if (freq === "weekly") return end;
  if (freq === "annual") {
    return startOfDay(new Date(end.getFullYear(), 11, 31));
  }
  return startOfDay(new Date(end.getFullYear(), end.getMonth() + 1, 0));
}

function parseTxnDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

function txnChargeType(txn: Transaction): ChargeType {
  const raw = (txn.charge_type || "rent").trim().toLowerCase();
  if (raw === "service_charge" || raw === "other") return raw;
  return "rent";
}

function currentPeriod(unit: Unit, now: Date): { start: Date; end: Date } {
  const due = dueDateForUnit(unit.due_day, unit.frequency, now, unit.due_month);
  if (due) {
    return { start: periodStart(due, unit.frequency), end: periodEnd(due, unit.frequency) };
  }
  const y = now.getFullYear();
  if ((unit.frequency || "monthly") === "annual") {
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
  }
  const m = now.getMonth();
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
}

function paidRowsInPeriod(
  unit: Unit,
  transactions: Transaction[],
  now: Date,
  chargeType: ChargeType,
): Transaction[] {
  const { start, end } = currentPeriod(unit, now);
  return transactions.filter((t) => {
    if (t.status !== "paid" || txnChargeType(t) !== chargeType) return false;
    const paid = parseTxnDate(t.paid_at) || parseTxnDate(t.created_at);
    return Boolean(paid && paid >= start && paid <= end);
  });
}

function netPaid(t: Transaction): number {
  return Math.max(0, toNumber(t.amount) - toNumber(t.refunded_amount));
}

const DUE_SOON_DAYS = 7;
const PAID_TOLERANCE = 0.5;

function statusWhenOpen(
  unit: Unit,
  transactions: Transaction[],
  chargeType: ChargeType,
  now: Date,
): ChargeLineStatus {
  if (
    transactions.some(
      (t) => t.status === "overdue" && txnChargeType(t) === chargeType,
    )
  ) {
    return "OVERDUE";
  }
  const due = dueDateForUnit(unit.due_day, unit.frequency, now, unit.due_month);
  const today = startOfDay(now);
  if (due && due < today) return "OVERDUE";
  if (due) {
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (days >= 0 && days <= DUE_SOON_DAYS) return "DUE SOON";
  }
  return "PENDING";
}

export type ChargeLine = {
  status: ChargeLineStatus;
  expected: number;
  paid: number;
  remaining: number;
};

/**
 * This period per charge (mirrors lib/unit_status.py charge_breakdown): paid = net of
 * refunds over paid rows dated in the period; PAID only when that covers the amount.
 * Overpaying one charge covers the other (tenant checkout records rent + service
 * charge as one rent row).
 */
export function chargeBreakdown(
  unit: Unit,
  transactions: Transaction[],
  now: Date = new Date(),
): Partial<Record<"rent" | "service_charge", ChargeLine>> {
  const expected: Partial<Record<"rent" | "service_charge", number>> = {
    rent: toNumber(unit.rent_amount),
  };
  const service = toNumber(unit.service_charge_amount);
  if (service > 0) expected.service_charge = service;

  const kinds = Object.keys(expected) as Array<"rent" | "service_charge">;
  const rows = Object.fromEntries(
    kinds.map((kind) => [kind, paidRowsInPeriod(unit, transactions, now, kind)]),
  ) as Record<"rent" | "service_charge", Transaction[]>;
  const raw = Object.fromEntries(
    kinds.map((kind) => [kind, rows[kind].reduce((sum, t) => sum + netPaid(t), 0)]),
  ) as Record<"rent" | "service_charge", number>;
  const paid = { ...raw };
  if (service > 0) {
    paid.rent += Math.max(0, raw.service_charge - service);
    paid.service_charge += Math.max(0, raw.rent - (expected.rent ?? 0));
  }

  const out: Partial<Record<"rent" | "service_charge", ChargeLine>> = {};
  for (const kind of kinds) {
    const amount = expected[kind] ?? 0;
    const covered =
      amount > 0 ? paid[kind] >= amount - PAID_TOLERANCE : rows[kind].length > 0;
    out[kind] = {
      status: covered ? "PAID" : statusWhenOpen(unit, transactions, kind, now),
      expected: amount,
      paid: amount > 0 ? Math.min(paid[kind], amount) : paid[kind],
      remaining: covered ? 0 : Math.max(0, amount - paid[kind]),
    };
  }
  return out;
}

/**
 * Status for a recurring charge line (rent or service charge).
 * Unit payments page shows these per line; properties list aggregates via resolveUnitStatus.
 */
export function resolveChargeStatus(
  unit: Unit,
  transactions: Transaction[],
  chargeType: "rent" | "service_charge",
  now: Date = new Date(),
): ChargeLineStatus {
  const line = chargeBreakdown(unit, transactions, now)[chargeType];
  if (line) return line.status;
  if (paidRowsInPeriod(unit, transactions, now, chargeType).length > 0) return "PAID";
  return statusWhenOpen(unit, transactions, chargeType, now);
}

const STATUS_RANK: Record<ChargeLineStatus, number> = {
  OVERDUE: 3,
  "DUE SOON": 2,
  PENDING: 1,
  PAID: 0,
};

/**
 * Properties-list / portfolio row status: worst across charge types that have
 * an expected due date (rent always; service charge when amount is set).
 * One-off `other` rows (no due date) are ignored so they cannot force OVERDUE.
 * Precedence: OVERDUE > DUE SOON > PENDING > PAID.
 */
export function resolveUnitStatus(
  unit: Unit,
  transactions: Transaction[],
  now: Date = new Date(),
): UnitStatus {
  const statuses: ChargeLineStatus[] = [
    resolveChargeStatus(unit, transactions, "rent", now),
  ];

  const serviceAmount = toNumber(unit.service_charge_amount);
  if (serviceAmount > 0) {
    statuses.push(
      resolveChargeStatus(unit, transactions, "service_charge", now),
    );
  }

  let worst: ChargeLineStatus = "PAID";
  for (const status of statuses) {
    if (STATUS_RANK[status] > STATUS_RANK[worst]) {
      worst = status;
    }
  }
  return worst;
}

export function parseTermEnd(
  value: string | null | undefined,
): Date | null {
  if (!value) return null;
  const text = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = startOfDay(new Date(`${text}T00:00:00`));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Days until term_end (negative if past). */
export function daysUntilTermEnd(
  unit: Unit,
  now: Date = new Date(),
): number | null {
  const end = parseTermEnd(unit.term_end);
  if (!end) return null;
  const today = startOfDay(now);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

export function buildDashboard(properties: Property[]): {
  rows: DashboardRow[];
  stats: DashboardStats;
} {
  const rows: DashboardRow[] = [];
  let totalCollected = 0;
  let outstanding = 0;
  let unitsOverdue = 0;

  for (const property of properties) {
    appendPropertyRows(property, rows, (stats) => {
      totalCollected += stats.collected;
      outstanding += stats.outstanding;
      unitsOverdue += stats.overdue;
    });
  }

  rows.sort((a, b) => a.unit.localeCompare(b.unit));

  return {
    rows,
    stats: { totalCollected, outstanding, unitsOverdue },
  };
}

function appendUnitRow(
  propertyId: string,
  propertyName: string,
  unit: Unit,
  rows: DashboardRow[],
): { collected: number; outstanding: number; overdue: number } {
  const transactions = unit.transactions ?? [];
  const rent = toNumber(unit.rent_amount);
  const serviceCharge = toNumber(unit.service_charge_amount);
  const status = resolveUnitStatus(unit, transactions);

  let collected = 0;
  for (const txn of transactions) {
    if (txn.status === "paid") {
      collected += toNumber(txn.amount);
    }
  }

  const outstanding = Object.values(chargeBreakdown(unit, transactions)).reduce(
    (sum, line) => sum + (line?.remaining ?? 0),
    0,
  );
  const overdue = status === "OVERDUE" ? 1 : 0;

  rows.push({
    unitId: unit.id,
    propertyId,
    unit: propertyName ? `${propertyName} · ${unit.label}` : unit.label,
    tenant: unit.tenant_name?.trim() || "-",
    rent,
    serviceCharge,
    dueDate: dueDateForUnit(unit.due_day, unit.frequency, new Date(), unit.due_month),
    status,
    tenantContact: unit.tenant_contact ?? null,
    propertyName,
    unitLabel: unit.label,
    needsUnit: false,
  });

  return { collected, outstanding, overdue };
}

function appendPropertyRows(
  property: Property,
  rows: DashboardRow[],
  onStats: (stats: {
    collected: number;
    outstanding: number;
    overdue: number;
  }) => void,
): void {
  const units = Array.isArray(property.units) ? property.units : [];

  if (units.length === 0) {
    rows.push({
      unitId: null,
      propertyId: property.id,
      unit: property.name?.trim() || "Untitled property",
      unitLabel: undefined,
      tenant: "-",
      rent: 0,
      dueDate: null,
      status: "PENDING",
      propertyName: property.name,
      needsUnit: true,
    });
    return;
  }

  for (const unit of units) {
    onStats(appendUnitRow(property.id, property.name ?? "", unit, rows));
  }
}

export function buildDashboardFromPortfolio(
  portfolioUnits: PortfolioUnit[],
  emptyProperties: Property[] = [],
): { rows: DashboardRow[]; stats: DashboardStats } {
  const rows: DashboardRow[] = [];
  let totalCollected = 0;
  let outstanding = 0;
  let unitsOverdue = 0;

  for (const property of emptyProperties) {
    appendPropertyRows(property, rows, () => {});
  }

  for (const item of portfolioUnits) {
    const stats = appendUnitRow(
      item.property_id,
      item.property_name,
      item.unit,
      rows,
    );
    totalCollected += stats.collected;
    outstanding += stats.outstanding;
    unitsOverdue += stats.overdue;
  }

  rows.sort((a, b) => a.unit.localeCompare(b.unit));

  return {
    rows,
    stats: { totalCollected, outstanding, unitsOverdue },
  };
}

/** Naira with a non-breaking space after ₦ (clear gap; no wrap between symbol and digits). */
const NAIRA = "\u20a6";
const NAIRA_GAP = "\u00A0";

export function formatNaira(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const digits = new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${NAIRA}${NAIRA_GAP}${digits}`;
}

export function formatDueDate(date: Date | null): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function chargeTypeLabel(
  chargeType?: ChargeType | string | null,
  chargeLabel?: string | null,
): string {
  const type = (chargeType || "rent").toLowerCase();
  if (type === "service_charge") return "Service charge";
  if (type === "other") return (chargeLabel || "").trim() || "Other";
  return "Rent";
}

export function chargeStatusTone(status: ChargeLineStatus | string): string {
  if (status === "PAID" || status === "paid") return "paid";
  if (status === "OVERDUE" || status === "overdue" || status === "failed") {
    return "overdue";
  }
  if (status === "DUE SOON") return "due-soon";
  return "pending";
}
