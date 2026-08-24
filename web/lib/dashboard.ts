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

function paidInCurrentPeriod(
  unit: Unit,
  transactions: Transaction[],
  now: Date = new Date(),
  chargeType: ChargeType = "rent",
): boolean {
  const matching = transactions.filter(
    (t) => txnChargeType(t) === chargeType,
  );
  const due = dueDateForUnit(unit.due_day, unit.frequency, now, unit.due_month);
  if (!due) {
    const y = now.getFullYear();
    const m = now.getMonth();
    return matching.some((t) => {
      if (t.status !== "paid") return false;
      const paid = parseTxnDate(t.paid_at) || parseTxnDate(t.created_at);
      if (!paid) return false;
      if ((unit.frequency || "monthly") === "annual") {
        return paid.getFullYear() === y;
      }
      return paid.getFullYear() === y && paid.getMonth() === m;
    });
  }

  const start = periodStart(due, unit.frequency);
  const end = periodEnd(due, unit.frequency);

  return matching.some((t) => {
    if (t.status !== "paid") return false;
    const paid = parseTxnDate(t.paid_at) || parseTxnDate(t.created_at);
    if (!paid) return false;
    return paid >= start && paid <= end;
  });
}

const DUE_SOON_DAYS = 7;

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
  const matching = transactions.filter(
    (t) => txnChargeType(t) === chargeType,
  );
  if (paidInCurrentPeriod(unit, transactions, now, chargeType)) return "PAID";
  if (matching.some((t) => t.status === "overdue")) return "OVERDUE";

  const due = dueDateForUnit(unit.due_day, unit.frequency, now, unit.due_month);
  const today = startOfDay(now);
  if (due && due < today) return "OVERDUE";
  if (due) {
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (days >= 0 && days <= DUE_SOON_DAYS) return "DUE SOON";
  }
  return "PENDING";
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
  const rentStatus = resolveChargeStatus(unit, transactions, "rent");
  const serviceStatus =
    serviceCharge > 0
      ? resolveChargeStatus(unit, transactions, "service_charge")
      : null;

  let collected = 0;
  for (const txn of transactions) {
    if (txn.status === "paid") {
      collected += toNumber(txn.amount);
    }
  }

  let outstanding = 0;
  if (rentStatus !== "PAID") outstanding += rent;
  if (serviceStatus && serviceStatus !== "PAID") outstanding += serviceCharge;
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
      tenant: "—",
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
