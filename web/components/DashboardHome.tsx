"use client";

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  CircleAlert,
  FileText,
  ListChecks,
  MapPin,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardHeroArt } from "@/components/DashboardHeroArt";
import { FetchErrorState } from "@/components/FetchErrorState";
import { KpiCard, KpiGrid, KpiTrend } from "@/components/KpiCard";
import { useOptionalUserMenuProfile } from "@/components/UserMenu";
import {
  fetchApplications,
  fetchMaintenanceBoard,
  fetchPortfolioOverview,
  fetchPortfolioPaymentsPage,
  fetchPortfolioTenancies,
  fetchUrgentActions,
  type MaintenanceBoardPayload,
  type PortfolioOverview,
  type RentalApplication,
  type UrgentActionsPayload,
} from "@/lib/api";
import { formatDueDate, formatNaira } from "@/lib/dashboard";
import {
  buildActivity,
  cardsFromOverview,
  countNewTenantsThisMonth,
  formatRelativeTime,
  type ActivityKind,
  type PropertyCardStatus,
} from "@/lib/dashboard-home";
import type { PortfolioPayment } from "@/lib/types";
import { useGreeting } from "@/lib/use-greeting";

const PROPERTY_LIMIT = 5;

type HomeData = {
  loadedAt: Date;
  overview: PortfolioOverview;
  payments: PortfolioPayment[] | null;
  actions: UrgentActionsPayload | null;
  applications: RentalApplication[] | null;
  board: MaintenanceBoardPayload | null;
  newTenants: number | null;
};

const STATUS_PILL: Record<PropertyCardStatus, { label: string; tone: string }> = {
  overdue: { label: "Overdue", tone: "overdue" },
  "due-soon": { label: "Due soon", tone: "due-soon" },
  occupied: { label: "Occupied", tone: "paid" },
  vacant: { label: "Vacant", tone: "pending" },
  empty: { label: "No units", tone: "pending" },
};

const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  payment: Wallet,
  action: CircleAlert,
  application: FileText,
  "work-order": Wrench,
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function initialsFor(name: string): string {
  const [first = "", second = ""] = name.match(/[A-Za-z0-9]+/g) ?? [];
  if (!first) return "P";
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${second[0]}`.toUpperCase();
}

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function DashboardHero({ hasProperties }: { hasProperties: boolean }) {
  const greeting = useGreeting();
  const profile = useOptionalUserMenuProfile();
  const firstName = profile?.loading ? "" : (profile?.firstName ?? "");

  return (
    <header className="dash-hero">
      <div className="dash-hero-text">
        {firstName ? (
          <p className="dash-hero-greeting">{greeting ? `${greeting},` : "Welcome,"}</p>
        ) : null}
        <h1 className="dash-hero-title">{firstName || greeting || "Dashboard"}</h1>
        <p className="dash-hero-sub">
          Here’s what’s happening with your properties today.
        </p>
      </div>
      <div className="dash-hero-aside">
        <DashboardHeroArt />
        <Link
          href={hasProperties ? "/properties/new" : "/onboarding"}
          className="btn-primary dash-hero-add"
        >
          <Plus size={18} strokeWidth={2} aria-hidden />
          Add property
        </Link>
      </div>
    </header>
  );
}

function DashboardSkeleton() {
  return (
    <section className="dashboard dash-home" aria-busy="true" aria-label="Loading dashboard">
      <DashboardHero hasProperties />
      <KpiGrid label="Portfolio overview">
        {(
          [
            [Building2, "Total properties"],
            [Users, "Total tenants"],
            [Wallet, "Overdue rent"],
            [ListChecks, "Active work orders"],
          ] as const
        ).map(([icon, label]) => (
          <KpiCard
            key={label}
            icon={icon}
            label={label}
            value={<span className="skeleton-bar" style={{ width: "3rem" }} />}
            foot={<span className="skeleton-bar" style={{ width: "50%" }} />}
          />
        ))}
      </KpiGrid>
      <div className="dash-grid">
        <div className="dash-panel">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="skeleton-bar dash-skeleton-row" />
          ))}
        </div>
        <div className="dash-panel">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="skeleton-bar dash-skeleton-row" />
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashboardHome() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (): Promise<HomeData> => {
    const [overview, payments, actions, applications, board, tenancies] = await Promise.all([
      fetchPortfolioOverview(),
      settle(fetchPortfolioPaymentsPage(null)),
      settle(fetchUrgentActions()),
      settle(fetchApplications()),
      settle(fetchMaintenanceBoard()),
      settle(fetchPortfolioTenancies()),
    ]);
    const loadedAt = new Date();
    return {
      loadedAt,
      overview,
      payments: payments?.items ?? null,
      actions,
      applications: applications?.items ?? null,
      board,
      newTenants: tenancies
        ? countNewTenantsThisMonth(tenancies.items, loadedAt)
        : null,
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await load();
        if (active) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [load, reloadKey]);

  const view = useMemo(() => {
    if (!data) return null;
    const { overview } = data;
    const activity = buildActivity({
      payments: data.payments ?? [],
      actions: data.actions?.items ?? [],
      applications: data.applications ?? [],
      workOrders: data.board?.items ?? [],
    });
    const inProgress = (data.board?.items ?? []).filter(
      (item) => item.status === "in_progress",
    ).length;
    return {
      cards: cardsFromOverview(overview.properties, formatDueDate),
      activity,
      propertyTotal: overview.property_count,
      unitTotal: overview.unit_count,
      occupied: overview.occupied,
      vacant: overview.vacant,
      overdueAmount: overview.overdue_amount,
      overdue: overview.overdue_units,
      dueWeekAmount: overview.due_week_amount,
      newThisMonth: overview.new_this_month,
      newTenants: data.newTenants,
      openWorkOrders: data.board?.open_count ?? null,
      inProgress,
    };
  }, [data]);

  if (error && !data) {
    return (
      <FetchErrorState
        title="Couldn’t load your dashboard"
        message={error}
        onRetry={() => {
          setError(null);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  if (!data || !view) return <DashboardSkeleton />;

  const hasProperties = view.propertyTotal > 0;
  const activityUnavailable =
    !data.payments && !data.actions && !data.applications && !data.board;

  return (
    <section className="dashboard dash-home">
      <DashboardHero hasProperties={hasProperties} />

      <KpiGrid label="Portfolio overview">
        <KpiCard
          icon={Building2}
          label="Total properties"
          value={view.propertyTotal}
          foot={
            view.newThisMonth > 0 ? (
              <KpiTrend tone="up">{view.newThisMonth} new this month</KpiTrend>
            ) : (
              plural(view.unitTotal, "unit", "units")
            )
          }
        />
        <KpiCard
          icon={Users}
          label="Total tenants"
          value={view.occupied}
          foot={
            view.newTenants && view.newTenants > 0 ? (
              <KpiTrend tone="up">{view.newTenants} new this month</KpiTrend>
            ) : view.unitTotal === 0 ? (
              "No units yet"
            ) : view.vacant > 0 ? (
              plural(view.vacant, "vacant unit", "vacant units")
            ) : (
              "Fully let"
            )
          }
        />
        <KpiCard
          icon={Wallet}
          label="Overdue rent"
          value={formatNaira(view.overdueAmount)}
          foot={
            view.overdue > 0 ? (
              <KpiTrend tone="alert">
                {view.overdue} overdue
                {view.dueWeekAmount > 0 ? ` · ${formatNaira(view.dueWeekAmount)} due this week` : ""}
              </KpiTrend>
            ) : view.dueWeekAmount > 0 ? (
              `${formatNaira(view.dueWeekAmount)} due this week`
            ) : (
              "Nothing overdue"
            )
          }
        />
        <KpiCard
          icon={ListChecks}
          label="Active work orders"
          value={view.openWorkOrders ?? "–"}
          foot={
            view.openWorkOrders === null ? (
              "Couldn’t load"
            ) : (
              <KpiTrend tone={view.inProgress > 0 ? "up" : "muted"}>
                {view.inProgress} in progress
              </KpiTrend>
            )
          }
        />
      </KpiGrid>

      <div className="dash-grid">
        <section className="dash-panel" aria-labelledby="dash-properties-title">
          <header className="dash-panel-head">
            <div className="dash-panel-heading">
              <h2 id="dash-properties-title" className="dash-panel-title">
                Properties
              </h2>
              {hasProperties ? (
                <p className="dash-panel-meta">
                  {plural(view.propertyTotal, "property", "properties")} ·{" "}
                  {plural(view.unitTotal, "unit", "units")}
                </p>
              ) : null}
            </div>
            {hasProperties ? (
              <Link href="/properties" className="dash-panel-link">
                View all
                <ArrowRight size={15} strokeWidth={1.75} aria-hidden />
              </Link>
            ) : null}
          </header>
          {view.cards.length === 0 ? (
            <div className="dash-empty">
              <p>Add a property to start tracking rent.</p>
              <Link href="/onboarding" className="btn-secondary">
                Add your first property
              </Link>
            </div>
          ) : (
            <ul className="dash-property-list">
              {view.cards.slice(0, PROPERTY_LIMIT).map((card) => {
                const pill = STATUS_PILL[card.status];
                return (
                  <li key={card.id}>
                    <Link href={`/properties/${card.id}`} className="dash-property">
                      <span className="dash-property-thumb" aria-hidden="true">
                        {card.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={card.photoUrl} alt="" loading="lazy" />
                        ) : (
                          initialsFor(card.name)
                        )}
                      </span>
                      <span className="dash-property-main">
                        <span className="dash-property-name">{card.name}</span>
                        <span className="dash-property-address">
                          <MapPin size={13} strokeWidth={1.75} aria-hidden />
                          {card.address ?? "No address yet"}
                        </span>
                        <span className="dash-property-units">
                          {card.units === 0
                            ? "No units yet"
                            : `${plural(card.units, "unit", "units")} · ${card.occupied}/${card.units} occupied`}
                        </span>
                      </span>
                      <span className={`status-badge ${pill.tone} dash-property-pill`}>
                        {pill.label}
                      </span>
                      <span className="dash-property-money">
                        {card.amount !== null ? (
                          <span className="dash-property-amount mono-data">
                            {formatNaira(card.amount)}
                          </span>
                        ) : null}
                        <span className="dash-property-caption">{card.caption}</span>
                      </span>
                      <ChevronRight
                        className="dash-property-chevron"
                        size={18}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="dash-side">
          <section className="dash-panel" aria-labelledby="dash-activity-title">
            <header className="dash-panel-head">
              <h2 id="dash-activity-title" className="dash-panel-title">
                Recent activity
              </h2>
              {data.actions && data.actions.items.length > 0 ? (
                <Link href="/reminders" className="dash-panel-link">
                  Action needed
                  <ArrowRight size={15} strokeWidth={1.75} aria-hidden />
                </Link>
              ) : null}
            </header>
            {view.activity.length === 0 ? (
              <p className="dash-empty dash-empty--inline">
                {activityUnavailable
                  ? "Couldn’t load activity right now."
                  : "Payments, applications, and repairs will show up here."}
              </p>
            ) : (
              <ul className="dash-activity-list">
                {view.activity.map((item) => {
                  const Icon = ACTIVITY_ICON[item.kind];
                  return (
                    <li key={item.id}>
                      <Link href={item.href} className="dash-activity">
                        <span className="dash-activity-icon" data-kind={item.kind} aria-hidden="true">
                          <Icon size={16} strokeWidth={1.75} />
                        </span>
                        <span className="dash-activity-text">
                          <span className="dash-activity-title">{item.title}</span>
                          <span className="dash-activity-detail">{item.detail}</span>
                        </span>
                        <span className="dash-activity-time">
                          {item.at ? formatRelativeTime(item.at, data.loadedAt) : "Open"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Link href="/settings?tab=security" className="dash-promo">
            <span className="dash-promo-icon" aria-hidden="true">
              <ShieldCheck size={20} strokeWidth={1.75} />
            </span>
            <span className="dash-promo-text">
              <span className="dash-promo-title">Keep your account secure</span>
              <span className="dash-promo-body">
                Turn on two-step sign-in and review active sessions.
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
