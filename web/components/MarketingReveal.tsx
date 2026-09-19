"use client";

import {
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Extra delay before revealing (ms). */
  delayMs?: number;
  /** Element tag — use `li` inside feature lists. */
  as?: "div" | "li";
};

function subscribeReducedMotion(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Canonical one-shot scroll presence for marketing (not continuous parallax).
 * Never use under `.app-shell` — CSS kill-switch + keep product calm.
 */
export function MarketingReveal({
  children,
  className,
  delayMs = 0,
  as = "div",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );
  const Tag = as as ElementType;

  useEffect(() => {
    if (reducedMotion) return;
    const node = ref.current;
    if (!node) return;
    // Never run scroll storytelling in the product shell (CSS kill-switch backs this).
    if (node.closest(".app-shell") || !node.closest(".marketing")) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (delayMs > 0) {
              window.setTimeout(() => setInView(true), delayMs);
            } else {
              setInView(true);
            }
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [delayMs, reducedMotion]);

  const classes = ["marketing-reveal", className].filter(Boolean).join(" ");
  const shown = reducedMotion || inView;

  return (
    <Tag
      ref={ref}
      className={classes}
      data-in={shown ? "true" : undefined}
    >
      {children}
    </Tag>
  );
}
