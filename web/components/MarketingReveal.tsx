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

function isAlreadyVisible(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  if (vh <= 0) return true;
  // Soft margins: mobile Safari IO with negative rootMargin often never fires.
  return rect.top < vh * 0.96 && rect.bottom > vh * 0.04;
}

/**
 * Canonical one-shot scroll presence for marketing (not continuous parallax).
 * Never use under `.app-shell` — CSS kill-switch + keep product calm.
 *
 * Default paint is visible; motion only arms after client mount so iOS never
 * leaves sections stuck at opacity 0 when IntersectionObserver misses.
 */
export function MarketingReveal({
  children,
  className,
  delayMs = 0,
  as = "div",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [armed, setArmed] = useState(false);
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

    let delayTimer = 0;
    let failsafeTimer = 0;
    let revealed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      if (delayMs > 0) {
        delayTimer = window.setTimeout(() => setInView(true), delayMs);
      } else {
        setInView(true);
      }
    };

    // Arm hide-for-motion only after we know we can observe / fall back.
    setArmed(true);

    if (isAlreadyVisible(node)) {
      reveal();
    }

    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) {
                  reveal();
                  observer?.disconnect();
                  break;
                }
              }
            },
            { rootMargin: "0px 0px -4% 0px", threshold: 0.05 },
          )
        : null;

    observer?.observe(node);

    // Failsafe: never leave blank marketing sections on flaky mobile IO.
    failsafeTimer = window.setTimeout(reveal, 900 + Math.max(0, delayMs));

    return () => {
      observer?.disconnect();
      if (delayTimer) window.clearTimeout(delayTimer);
      if (failsafeTimer) window.clearTimeout(failsafeTimer);
    };
  }, [delayMs, reducedMotion]);

  const classes = ["marketing-reveal", className].filter(Boolean).join(" ");
  const shown = reducedMotion || inView || !armed;

  return (
    <Tag
      ref={ref}
      className={classes}
      data-armed={armed && !shown ? "true" : undefined}
      data-in={shown ? "true" : undefined}
    >
      {children}
    </Tag>
  );
}
