import {
  fetchPortfolioUnitsPage,
  type MaintenanceRequest,
  type PortfolioOverviewProperty,
  type PortfolioTenancy,
  type RentalApplication,
  type UrgentActionItem,
} from "@/lib/api";
import { formatNaira } from "@/lib/dashboard";
import type { PortfolioPayment, PortfolioUnit } from "@/lib/types";

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

const CAPTION: Record<PropertyCardStatus, string> = {
  overdue: "Overdue",
  "due-soon": "Rent due",
  occupied: "Rent roll",
  vacant: "Asking rent",
  empty: "Add a unit",
};

/** Server-built cards (already most urgent first) with display captions. */
export function cardsFromOverview(
  properties: PortfolioOverviewProperty[],
  formatDate: (date: Date | null) => string,
): PropertyCard[] {
  return properties.map((property) => {
    const nextDue = property.status === "occupied" ? parseDay(property.next_due) : null;
    return {
      id: property.id,
      name: property.name,
      address: property.address,
      photoUrl: property.photo_url,
      units: property.units,
      occupied: property.occupied,
      status: property.status,
      amount: property.amount,
      caption: nextDue ? `Next due ${formatDate(nextDue)}` : CAPTION[property.status],
    };
  });
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
