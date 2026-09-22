"use client";

import { MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

import { BRAND_NAME, supportWhatsAppUrl } from "@/lib/brand";

const STORAGE_KEY = "nexora_lets_talk_dismissed";

type LetsTalkSupportProps = {
  /** Prefill text for WhatsApp. */
  message?: string;
};

/**
 * Auth-page support cue — cursive “Let’s talk” signature that opens WhatsApp.
 * Hidden when NEXT_PUBLIC_SUPPORT_WHATSAPP is unset, or after dismiss (session).
 */
export function LetsTalkSupport({ message }: LetsTalkSupportProps) {
  const href = supportWhatsAppUrl(
    message ||
      `Hi ${BRAND_NAME} support. I need help getting into my account.`,
  );
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* private mode */
    }
    setReady(true);
  }, []);

  if (!href || !ready || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="lets-talk" role="complementary" aria-label="Chat support">
      <button
        type="button"
        className="lets-talk-dismiss"
        aria-label="Dismiss support hint"
        onClick={dismiss}
      >
        <X size={14} strokeWidth={2} aria-hidden />
      </button>
      <a
        className="lets-talk-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="lets-talk-script" aria-hidden>
          Let&apos;s talk....
        </span>
        <svg
          className="lets-talk-swoop"
          viewBox="0 0 120 48"
          fill="none"
          aria-hidden
        >
          <path
            d="M4 28 C 36 8, 72 6, 108 22"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M98 18 C 108 22, 112 28, 110 36"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="lets-talk-fab" aria-hidden>
          <MessageCircle size={22} strokeWidth={2} />
        </span>
        <span className="sr-only">Message {BRAND_NAME} support on WhatsApp</span>
      </a>
    </div>
  );
}
