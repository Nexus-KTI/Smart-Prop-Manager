import {
  fetchPortfolioUnitsPage,
  type MaintenanceRequest,
  type PortfolioTenancy,
  type RentalApplication,
  type UrgentActionItem,
} from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";
import type {
  DashboardRow,
  PortfolioPayment,
  PortfolioUnit,
  Property,
} from "@/lib/types";

/** Pages of /properties/portfolio/units the home view reads before stopping. */
const PORTFOLIO_PAGE_CAP = 10;

export async function fetchPortfolioUnitsCapped(): Promise<{
  items: PortfolioUnit[];
  capped: boolean;
}> {
  const items: PortfolioUnit[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await fetchPortfolioUnitsPage(cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
    pages += 1;
  } while (cursor && pages < PORTFOLIO_PAGE_CAP);
  return { items, capped: Boolean(cursor) };
}

export type PropertyCardStatus = "overdue" | "due-soon" | "occupied" | "vacant" | "empty";

export type PropertyCard = {
  id: string;
  name: string;
  address: string | null;
  photoUrl: string | null;
  units: number;
  occupied: number;
  status: PropertyCardStatus;
  amount: number | null;
  caption: string;
};

function rowIsVacant(row: DashboardRow): boolean {
  const tenant = (row.tenant || "").trim();
  return !tenant || tenant === "-";
}

const STATUS_RANK: Record<PropertyCardStatus, number> = {
  overdue: 0,
  "due-soon": 1,
  occupied: 2,
  vacant: 3,
  empty: 4,
};

/** One card per property, most urgent first. */
export function buildPropertyCards(
  rows: DashboardRow[],
  properties: Property[],
  portfolioUnits: PortfolioUnit[],
  formatDate: (date: Date | null) => string,
): PropertyCard[] {
  const byId = new Map<string, Property>();
  for (const property of properties) byId.set(property.id, property);

  const photos = new Map<string, string>();
  for (const item of portfolioUnits) {
    const url = item.unit.photo_url?.trim();
    if (url && !photos.has(item.property_id)) photos.set(item.property_id, url);
  }

  const grouped = new Map<string, { name: string; rows: DashboardRow[] }>();
  for (const row of rows) {
    if (!row.propertyId) continue;
    const entry = grouped.get(row.propertyId) ?? {
      name: row.propertyName?.trim() || "Untitled property",
      rows: [],
    };
    if (!row.needsUnit) entry.rows.push(row);
    grouped.set(row.propertyId, entry);
  }
  for (const property of properties) {
    if (!grouped.has(property.id)) {
      grouped.set(property.id, { name: property.name, rows: [] });
    }
  }

  const cards: PropertyCard[] = [];
  for (const [id, { name, rows: unitRows }] of grouped) {
    const occupiedRows = unitRows.filter((row) => !rowIsVacant(row));
    const overdue = occupiedRows.filter((row) => row.status === "OVERDUE");
    const dueSoon = occupiedRows.filter((row) => row.status === "DUE SOON");
    const sum = (list: DashboardRow[]) =>
      list.reduce((total, row) => total + row.rent + (row.serviceCharge ?? 0), 0);

    let status: PropertyCardStatus;
    let amount: number | null = null;
    let caption: string;
    if (unitRows.length === 0) {
      status = "empty";
      caption = "Add a unit";
    } else if (overdue.length > 0) {
      status = "overdue";
      amount = sum(overdue);
      caption = "Overdue";
    } else if (dueSoon.length > 0) {
      status = "due-soon";
      amount = sum(dueSoon);
      caption = "Rent due";
    } else if (occupiedRows.length === 0) {
      status = "vacant";
      amount = sum(unitRows);
      caption = "Asking rent";
    } else {
      status = "occupied";
      const next = occupiedRows
        .filter((row) => row.dueDate)
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];
      amount = next ? next.rent + (next.serviceCharge ?? 0) : sum(occupiedRows);
      caption = next ? `Next due ${formatDate(next.dueDate)}` : "Rent roll";
    }

    cards.push({
      id,
      name: byId.get(id)?.name?.trim() || name,
      address: byId.get(id)?.address?.trim() || null,
      photoUrl: photos.get(id) ?? null,
      units: unitRows.length,
      occupied: occupiedRows.length,
      status,
      amount,
      caption,
    });
  }

  return cards.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.name.localeCompare(b.name),
  );
}

export type ActivityKind = "payment" | "action" | "application" | "work-order";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  href: string;
  /** Null for open queue items that have no event time (Action needed). */
  at: Date | null;
};

function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function place(property?: string | null, unit?: string | null): string {
  return [property, unit].map((part) => (part || "").trim()).filter(Boolean).join(" · ");
}

const WORK_ORDER_STATUS: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  canceled: "Canceled",
};

const ACTION_TITLE: Record<string, string> = {
  overdue_chase: "Rent overdue",
  overdue_no_contact: "Overdue, no contact",
  due_soon: "Rent due soon",
  lease_ending: "Lease ending",
  chase_failed: "Reminder failed",
};

/** Open Action needed items first, then the newest dated events. */
export function buildActivity({
  payments,
  actions,
  applications,
  workOrders,
  limit = 5,
}: {
  payments: PortfolioPayment[];
  actions: UrgentActionItem[];
  applications: RentalApplication[];
  workOrders: MaintenanceRequest[];
  limit?: number;
}): ActivityItem[] {
  const pinned: ActivityItem[] = actions.slice(0, 2).map((item) => ({
    id: `action-${item.id}`,
    kind: "action",
    title: ACTION_TITLE[item.kind] ?? "Action needed",
    detail:
      place(item.property_name, item.unit_label) +
      (item.tenant_name ? ` · ${item.tenant_name}` : ""),
    href: item.kind === "chase_failed" ? "/reminders?filter=failed" : `/reminders/${item.unit_id}`,
    at: null,
  }));

  const dated: ActivityItem[] = [];
  for (const payment of payments) {
    if (payment.status !== "paid") continue;
    const amount = formatNaira(Number(payment.amount) || 0);
    const who = payment.tenant_name?.trim() || "Tenant";
    const where = place(payment.property_name, payment.unit_label);
    dated.push({
      id: `payment-${payment.id}`,
      kind: "payment",
      title: "Payment received",
      detail: `${who} paid ${amount}${where ? ` · ${where}` : ""}`,
      href: `/payments/${payment.unit_id}`,
      at: parseTime(payment.paid_at ?? payment.created_at),
    });
  }
  for (const application of applications) {
    if (application.status !== "submitted") continue;
    const who = application.applicant_name?.trim() || "Someone";
    const where = place(application.property_name, application.unit_label);
    dated.push({
      id: `application-${application.id}`,
      kind: "application",
      title: "New application",
      detail: `${who} applied${where ? ` for ${where}` : ""}`,
      href: "/applications",
      at: parseTime(application.created_at),
    });
  }
  for (const order of workOrders) {
    dated.push({
      id: `work-order-${order.id}`,
      kind: "work-order",
      title: "Work order updated",
      detail: `${order.title} · ${WORK_ORDER_STATUS[order.status] ?? order.status}`,
      href: "/work-orders",
      at: parseTime(order.updated_at ?? order.created_at),
    });
  }

  dated.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  return [...pinned, ...dated].slice(0, limit);
}

export function formatRelativeTime(date: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

function monthWindow(now: Date): { start: number; end: number } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
  };
}

/** Date-only strings stay on the local calendar day (no UTC shift). */
function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const text = value.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return parseTime(value);
}

function inThisMonth(date: Date | null, now: Date): boolean {
  if (!date) return false;
  const { start, end } = monthWindow(now);
  const time = date.getTime();
  return time >= start && time < end;
}

/** Properties created since the first of this month. */
export function countNewThisMonth(properties: Property[], now: Date): number {
  return properties.filter((property) =>
    inThisMonth(parseTime(property.created_at), now),
  ).length;
}

/**
 * Tenancies that started this month. Prefers start_date, then activated_at,
 * then created_at. Draft and ended rows are not tenants yet or no longer.
 */
export function countNewTenantsThisMonth(
  tenancies: PortfolioTenancy[],
  now: Date,
): number {
  return tenancies.filter((row) => {
    if (row.status === "draft" || row.status === "ended") return false;
    const started =
      parseDay(row.start_date) ??
      parseDay(row.activated_at) ??
      parseDay(row.created_at);
    return inThisMonth(started, now);
  }).length;
}
