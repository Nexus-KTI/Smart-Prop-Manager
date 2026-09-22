"use client";

import { X } from "lucide-react";

type LetsTalkSignatureProps = {
  /** Hide the cursive hint (FAB may still show). */
  hidden?: boolean;
  onDismiss?: () => void;
};

/**
 * GoodTenants-style cursive “Let’s talk….” flourish that sits beside a chat FAB.
 */
export function LetsTalkSignature({
  hidden = false,
  onDismiss,
}: LetsTalkSignatureProps) {
  if (hidden) return null;

  return (
    <div className="lets-talk-signature" aria-hidden>
      {onDismiss ? (
        <button
          type="button"
          className="lets-talk-dismiss"
          aria-label="Dismiss Let’s talk hint"
          onClick={onDismiss}
        >
          <X size={12} strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}
      <p className="lets-talk-script">Let&apos;s talk....</p>
      <svg
        className="lets-talk-swoop"
        viewBox="0 0 168 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Underline from the script, then loop around the FAB circle */}
        <path
          d="M6 34
             C 42 30, 78 28, 108 30
             C 124 31, 136 34, 144 40
             C 156 50, 154 62, 140 58
             C 128 54, 132 42, 146 38
             C 152 36, 156 36, 160 38"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
