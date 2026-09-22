"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { LetsTalkSignature } from "@/components/LetsTalkSignature";
import { BRAND_NAME, supportWhatsAppUrl } from "@/lib/brand";

const STORAGE_KEY = "nexora_lets_talk_dismissed";

type LetsTalkSupportProps = {
  /** Prefill text for WhatsApp. */
  message?: string;
};

/**
 * Auth-page support cue — GoodTenants-style signature opening WhatsApp.
 * Hidden when NEXT_PUBLIC_SUPPORT_WHATSAPP is unset.
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
    <div
      className="lets-talk-wrap is-hint-visible"
      role="complementary"
      aria-label="Chat support"
    >
      <LetsTalkSignature onDismiss={dismiss} />
      <a
        className="help-fab"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Message ${BRAND_NAME} support on WhatsApp`}
      >
        <MessageCircle size={22} strokeWidth={2} aria-hidden />
      </a>
    </div>
  );
}
