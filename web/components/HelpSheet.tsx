"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Home,
  MessageCircle,
  Search,
  Send,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useOptionalUserMenuProfile } from "@/components/UserMenu";
import { LetsTalkSignature } from "@/components/LetsTalkSignature";
import { BRAND_NAME, supportWhatsAppUrl } from "@/lib/brand";

export type HelpAudience = "landlord" | "tenant" | "artisan" | "admin";

type HelpTab = "home" | "messages" | "help";

type HelpArticle = {
  id: string;
  title: string;
  body: string;
  href?: string;
};

const AGENT_MARKS = ["N", "K", "T"] as const;

const ARTICLES: Record<HelpAudience, HelpArticle[]> = {
  tenant: [
    {
      id: "t-connect",
      title: "How do I connect with my landlord?",
      body: "Ask your landlord to send a Nexora invite from unit Payments. Open Claim invite, paste the link or code, and wait for them to activate occupancy.",
      href: "/tenant/claim",
    },
    {
      id: "t-pay",
      title: "How do I pay rent or fees?",
      body: "After your unit is active, open Fees to see what’s due. You can pay with Paystack when your landlord has it enabled, or follow their cash/transfer instructions and keep receipts here.",
      href: "/tenant/fees",
    },
    {
      id: "t-request",
      title: "How do I raise a repair request?",
      body: "Go to Requests, describe the issue, and submit. Your landlord (and any assigned artisan) will see it on the work-order list.",
      href: "/tenant/requests",
    },
    {
      id: "t-start",
      title: "Let’s get started",
      body: "Claim your invite, check Notices, then use Home for balance and next steps. Message your landlord anytime from Messages.",
      href: "/tenant",
    },
  ],
  landlord: [
    {
      id: "l-invite",
      title: "How do I invite a tenant?",
      body: "On Properties, open a vacant unit → Start tenancy → send the claim invite (queued SMS/WhatsApp when notify is configured, or copy the link). The tenant claims it, then you activate occupancy on the tenancy.",
      href: "/tenancies",
    },
    {
      id: "l-tenancies",
      title: "Where are my leases?",
      body: "Tenancies lists every occupancy record. Filter Ending soon for renewals, open a row for the dossier, or jump to Payments for that unit’s rent.",
      href: "/tenancies",
    },
    {
      id: "l-chase",
      title: "How do I chase overdue rent?",
      body: "Open Action needed on the primary rail after Payments (alert icon, not the header bell) — filter Urgent, Overdue, Ending soon, or Failed, then remind selected. The red count lives on Action needed; the header bell is a short summary that deep-links here (message unread only on the bell badge). Paid vs owing stays on the Properties money list. Portfolio managers chasing across owners use Across owners from Action needed or Team.",
      href: "/reminders",
    },
    {
      id: "l-expenses",
      title: "Where do I log money out?",
      body: "Expenses is under More. Record repairs, utilities, agency fees, and other costs there. Money in stays on Payments; together they are your books for the week.",
      href: "/expenses",
    },
    {
      id: "l-reports",
      title: "Where is my rent roll?",
      body: "Reports (under More) shows occupied vs vacant, each unit’s rent, and this month’s expense total. Open a unit for Payments or Start tenancy when vacant.",
      href: "/reports",
    },
    {
      id: "l-message",
      title: "Where do tenant messages live?",
      body: "Open Messages for chat and maintenance threads tied to each unit. Unread counts also show on the notification bell.",
      href: "/messages",
    },
    {
      id: "l-start",
      title: "Let’s get started",
      body: "Add a property and unit, set rent and due day, invite the tenant, then work from Properties → Payments each Friday.",
      href: "/properties",
    },
  ],
  artisan: [
    {
      id: "a-jobs",
      title: "Where are my assigned jobs?",
      body: "Your jobs list shows work orders landlords assigned to you. Open a job to update status when work progresses.",
      href: "/artisan",
    },
    {
      id: "a-claim",
      title: "How do I join a landlord’s roster?",
      body: "Use the claim link or invite they sent. Once linked, new jobs appear on Your jobs.",
      href: "/artisan/claim",
    },
    {
      id: "a-support",
      title: "Who do I contact for access issues?",
      body: "Chat with Nexora support on WhatsApp, or ask the landlord who invited you, they control roster access.",
    },
    {
      id: "a-start",
      title: "Let’s get started",
      body: "Claim your invite if you haven’t, then keep Your jobs open for new assignments.",
      href: "/artisan",
    },
  ],
  admin: [
    {
      id: "ad-leads",
      title: "How do I review access requests?",
      body: "Open Access requests to approve or decline landlord signup leads in the invite beta.",
      href: "/admin/leads",
    },
    {
      id: "ad-exit",
      title: "Where are phase exit metrics?",
      body: "Use the Phase 2–4 exit pages under Admin to re-run honest product metrics.",
      href: "/admin/phase4-exit",
    },
    {
      id: "ad-app",
      title: "How do I jump back to the landlord app?",
      body: "Use Landlord app in the sidebar footer, or open Properties directly.",
      href: "/properties",
    },
    {
      id: "ad-start",
      title: "Let’s get started",
      body: "Start with Access requests, then spot-check exit metrics when you need evidence, not guesses.",
      href: "/admin/leads",
    },
  ],
};

const MESSAGES_HREF: Record<HelpAudience, string> = {
  tenant: "/tenant/messages",
  landlord: "/messages",
  artisan: "/artisan",
  admin: "/admin/leads",
};

const HOME_HREF: Record<HelpAudience, string> = {
  tenant: "/tenant",
  landlord: "/properties",
  artisan: "/artisan",
  admin: "/admin/leads",
};

type HelpContextValue = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
};

const HelpContext = createContext<HelpContextValue | null>(null);

function firstName(displayName: string): string {
  const part = displayName.trim().split(/\s+/)[0];
  if (!part || part === "Account") return "";
  return part;
}

function waDefault(audience: HelpAudience): string {
  const role =
    audience === "tenant"
      ? "tenant"
      : audience === "artisan"
        ? "artisan"
        : audience === "admin"
          ? "admin"
          : "landlord";
  return `Hi ${BRAND_NAME} support. I need help with my ${role} account.`;
}

function HelpWidget({
  audience,
  open,
  onClose,
}: {
  audience: HelpAudience;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const profile = useOptionalUserMenuProfile();
  const name = firstName(profile?.displayName || "");
  const [tab, setTab] = useState<HelpTab>("home");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const supportUrl = supportWhatsAppUrl(waDefault(audience));
  const articles = ARTICLES[audience];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q),
    );
  }, [articles, query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setTab("home");
      setQuery("");
      setExpandedId(null);
    }
  }, [open, audience]);

  if (!open) return null;

  return (
    <div className="help-sheet-root" role="presentation">
      <button
        type="button"
        className="help-sheet-backdrop"
        aria-label="Close help"
        onClick={onClose}
      />
      <aside
        className="help-widget"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="help-widget-header">
          <div className="help-widget-agents" aria-hidden>
            {AGENT_MARKS.map((mark) => (
              <span key={mark} className="help-widget-agent">
                {mark}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="help-widget-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
          <div className="help-widget-greeting">
            <p id={titleId} className="help-widget-hi">
              {name ? `Hi ${name}` : "Hi there"} 👋
            </p>
            <p className="help-widget-sub">How can we help?</p>
          </div>
        </header>

        <div className="help-widget-body">
          {tab === "home" ? (
            <>
              {supportUrl ? (
                <a
                  href={supportUrl}
                  className="help-widget-chat"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Chat with us</span>
                  <span className="help-widget-chat-send" aria-hidden>
                    <Send size={16} strokeWidth={2} />
                  </span>
                </a>
              ) : (
                <p className="help-sheet-muted">
                  WhatsApp support isn’t configured (
                  <span className="mono-data">NEXT_PUBLIC_SUPPORT_WHATSAPP</span>
                  ).
                </p>
              )}

              <label className="help-widget-search">
                <span className="sr-only">Search for help</span>
                <input
                  type="search"
                  className="help-widget-search-input"
                  placeholder="Search for help"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Search
                  className="help-widget-search-icon"
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </label>

              <ul className="help-widget-articles">
                {filtered.length === 0 ? (
                  <li className="help-sheet-muted" style={{ padding: "8px 4px" }}>
                    No articles match “{query.trim()}”.
                  </li>
                ) : (
                  filtered.map((article) => {
                    const openArticle = expandedId === article.id;
                    return (
                      <li key={article.id}>
                        <button
                          type="button"
                          className="help-widget-article"
                          aria-expanded={openArticle}
                          onClick={() =>
                            setExpandedId(openArticle ? null : article.id)
                          }
                        >
                          <span className="help-widget-article-title">
                            {article.title}
                          </span>
                          <ChevronRight
                            size={16}
                            strokeWidth={1.75}
                            className="help-widget-article-chevron"
                            data-open={openArticle ? "true" : undefined}
                            aria-hidden
                          />
                        </button>
                        {openArticle ? (
                          <div className="help-widget-article-body">
                            <p>{article.body}</p>
                            {article.href ? (
                              <Link
                                href={article.href}
                                className="help-widget-article-cta"
                                onClick={onClose}
                              >
                                Open →
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          ) : null}

          {tab === "messages" ? (
            <div className="help-widget-panel">
              <p className="help-widget-panel-title">Messages</p>
              <p className="help-sheet-muted">
                In-app conversations live in Messages. Support chat opens on
                WhatsApp.
              </p>
              <Link
                href={MESSAGES_HREF[audience]}
                className="help-widget-chat"
                onClick={onClose}
              >
                <span>Open Messages</span>
                <span className="help-widget-chat-send" aria-hidden>
                  <MessageCircle size={16} strokeWidth={2} />
                </span>
              </Link>
              {supportUrl ? (
                <a
                  href={supportUrl}
                  className="help-widget-secondary"
                  target="_blank"
                  rel="noreferrer"
                >
                  Chat with support on WhatsApp
                </a>
              ) : null}
            </div>
          ) : null}

          {tab === "help" ? (
            <div className="help-widget-panel">
              <p className="help-widget-panel-title">Help centre</p>
              <p className="help-sheet-muted">
                Browse every article for your role, or search from Home.
              </p>
              <ul className="help-widget-articles">
                {articles.map((article) => {
                  const openArticle = expandedId === article.id;
                  return (
                    <li key={article.id}>
                      <button
                        type="button"
                        className="help-widget-article"
                        aria-expanded={openArticle}
                        onClick={() =>
                          setExpandedId(openArticle ? null : article.id)
                        }
                      >
                        <span className="help-widget-article-title">
                          {article.title}
                        </span>
                        <ChevronRight
                          size={16}
                          strokeWidth={1.75}
                          className="help-widget-article-chevron"
                          data-open={openArticle ? "true" : undefined}
                          aria-hidden
                        />
                      </button>
                      {openArticle ? (
                        <div className="help-widget-article-body">
                          <p>{article.body}</p>
                          {article.href ? (
                            <Link
                              href={article.href}
                              className="help-widget-article-cta"
                              onClick={onClose}
                            >
                              Open →
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <nav className="help-widget-tabs" aria-label="Help sections">
          <button
            type="button"
            className="help-widget-tab"
            data-active={tab === "home"}
            onClick={() => setTab("home")}
          >
            <Home size={18} strokeWidth={1.75} aria-hidden />
            Home
          </button>
          <button
            type="button"
            className="help-widget-tab"
            data-active={tab === "messages"}
            onClick={() => setTab("messages")}
          >
            <MessageCircle size={18} strokeWidth={1.75} aria-hidden />
            Messages
          </button>
          <button
            type="button"
            className="help-widget-tab"
            data-active={tab === "help"}
            onClick={() => setTab("help")}
          >
            <CircleHelp size={18} strokeWidth={1.75} aria-hidden />
            Help
          </button>
        </nav>
      </aside>
    </div>
  );
}

export function HelpProvider({
  audience,
  children,
}: {
  audience: HelpAudience;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <HelpContext.Provider value={{ open, close, toggle, isOpen }}>
      {children}
      <HelpWidget audience={audience} open={isOpen} onClose={close} />
    </HelpContext.Provider>
  );
}

function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error("Help controls must be used within HelpProvider");
  }
  return ctx;
}

export function HelpIconButton() {
  const { open } = useHelp();
  return (
    <button
      type="button"
      className="shell-topbar-icon-btn"
      aria-label="Help"
      title="Help"
      aria-haspopup="dialog"
      onClick={open}
    >
      <CircleHelp size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** Circular FAB with GoodTenants-style “Let’s talk” signature. */
export function HelpFab() {
  const { isOpen, toggle, open } = useHelp();
  const [hintDismissed, setHintDismissed] = useState(false);
  const [hintReady, setHintReady] = useState(false);

  useEffect(() => {
    try {
      setHintDismissed(sessionStorage.getItem("nexora_lets_talk_dismissed") === "1");
    } catch {
      /* private mode */
    }
    setHintReady(true);
  }, []);

  function dismissHint() {
    setHintDismissed(true);
    try {
      sessionStorage.setItem("nexora_lets_talk_dismissed", "1");
    } catch {
      /* ignore */
    }
  }

  const showHint = hintReady && !hintDismissed && !isOpen;

  return (
    <div
      className={
        showHint ? "lets-talk-wrap is-hint-visible" : "lets-talk-wrap"
      }
    >
      <LetsTalkSignature hidden={!showHint} onDismiss={dismissHint} />
      <button
        type="button"
        className="help-fab"
        aria-label={isOpen ? "Close help" : "Open help"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? toggle() : open())}
      >
        {isOpen ? (
          <ChevronDown size={22} strokeWidth={2} aria-hidden />
        ) : (
          <MessageCircle size={22} strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

/** Optional deep-link home for role chrome. */
export function helpHomeHref(audience: HelpAudience): string {
  return HOME_HREF[audience];
}
