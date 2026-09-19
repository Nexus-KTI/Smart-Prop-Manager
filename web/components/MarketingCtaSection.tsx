"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { MarketingCallbackForm } from "@/components/MarketingCallbackForm";
import { MarketingCtaForm } from "@/components/MarketingCtaForm";

type Panel = "access" | "callback" | null;

function panelFromHash(hash: string): Panel {
  const id = hash.replace(/^#/, "");
  if (id === "get-started" || id === "request-access") return "access";
  if (id === "whatsapp-callback") return "callback";
  return null;
}

function scrollToPanel(panel: Exclude<Panel, null>) {
  const id = panel === "access" ? "get-started" : "whatsapp-callback";
  window.setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 0);
}

type Props = {
  inviteOnly?: boolean;
  primaryLabel?: string;
};

export function MarketingCtaSection({
  inviteOnly = false,
  primaryLabel,
}: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const ctaLabel =
    primaryLabel ?? (inviteOnly ? "Request access" : "Start free");

  useEffect(() => {
    function syncFromHash() {
      const next = panelFromHash(window.location.hash);
      if (!next) return;
      setPanel(next);
      scrollToPanel(next);
    }

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  function openAccess() {
    if (panel === "access") {
      setPanel(null);
      window.history.replaceState(null, "", "#request-access");
      return;
    }
    setPanel("access");
    window.history.replaceState(null, "", "#get-started");
    scrollToPanel("access");
  }

  function openCallback() {
    if (panel === "callback") {
      setPanel(null);
      window.history.replaceState(null, "", "#request-access");
      return;
    }
    setPanel("callback");
    window.history.replaceState(null, "", "#whatsapp-callback");
    scrollToPanel("callback");
  }

  return (
    <div className="marketing-cta-block">
      <div className="marketing-cta-actions">
        {inviteOnly ? (
          <button
            type="button"
            className="btn-primary"
            aria-expanded={panel === "access"}
            aria-controls="get-started-form"
            onClick={openAccess}
          >
            {ctaLabel}
          </button>
        ) : (
          <Link href="/signup" className="btn-primary">
            {ctaLabel}
          </Link>
        )}
      </div>
      <p className="marketing-cta-secondary-links">
        <button
          type="button"
          className="marketing-cta-text-btn"
          aria-expanded={panel === "callback"}
          aria-controls="whatsapp-callback"
          onClick={openCallback}
        >
          Prefer a WhatsApp callback
        </button>
        {inviteOnly ? (
          <>
            <span className="marketing-cta-sep" aria-hidden>
              ·
            </span>
            <Link href="/signup">Have an invite? Sign up</Link>
          </>
        ) : null}
      </p>

      {panel === "callback" ? (
        <div
          id="whatsapp-callback"
          className="marketing-cta-card"
          aria-label="WhatsApp callback request"
        >
          <MarketingCallbackForm />
        </div>
      ) : null}

      {panel === "access" ? (
        <div
          id="get-started-form"
          className="marketing-cta-card"
          aria-label="Access request form"
        >
          <MarketingCtaForm inviteOnly={inviteOnly} />
        </div>
      ) : null}
    </div>
  );
}
