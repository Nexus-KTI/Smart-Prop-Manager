"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  className?: string;
  /** Stagger delay within a card group (e.g. index * 80). Ignored when reduced-motion. */
  delayMs?: number;
  children: ReactNode;
};

function isInViewport(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  return rect.top < window.innerHeight - 32 && rect.bottom > 0;
}

/**
 * Marketing-only scroll reveal (`web/app/(marketing)/`).
 * Fade up 16px + opacity once on enter; optional stagger via `delayMs`.
 * Disabled entirely under prefers-reduced-motion and never under `.app-shell`.
 */
export function RevealItem({ className = "", delayMs = 0, children }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const [motionOn, setMotionOn] = useState(false);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Never run scroll storytelling in the product shell.
    if (node.closest(".app-shell") || !node.closest(".marketing")) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    setMotionOn(true);

    if (isInViewport(node)) {
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Generous rootMargin so nearby cards aren't left invisible off-screen.
      { threshold: 0.05, rootMargin: "0px 0px 20% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Until motion is armed, render fully visible (no blank SSR/screenshot gaps).
  const motionClass = motionOn
    ? `reveal-on-scroll${visible ? " is-in" : ""}`
    : "";

  return (
    <li
      ref={ref}
      className={[motionClass, className].filter(Boolean).join(" ")}
      style={
        motionOn && delayMs > 0
          ? ({ "--reveal-delay": `${delayMs}ms` } as CSSProperties)
          : undefined
      }
    >
      {children}
    </li>
  );
}
