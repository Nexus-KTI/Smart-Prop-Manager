"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  label: string;
  href: string;
};

/**
 * Mobile-only conversion bar. Stays hidden over the hero, then shows after
 * scroll. Hides again when the final CTA or footer is on screen so it doesn’t
 * cover forms or legal copy.
 */
export function MarketingStickyCta({ label, href }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const hero = document.querySelector(".marketing-hero");
    const finalCta = document.getElementById("get-started");
    const footer = document.querySelector(".marketing-footer");
    let heroOut = !hero;
    let coverIn = false;

    const sync = () => {
      setVisible(heroOut && !coverIn);
    };

    const observers: IntersectionObserver[] = [];

    if (hero) {
      const heroObserver = new IntersectionObserver(
        ([entry]) => {
          // Hide while any meaningful slice of the hero is still on screen.
          heroOut = !entry.isIntersecting || entry.intersectionRatio < 0.18;
          sync();
        },
        { root: null, threshold: [0, 0.18, 0.4], rootMargin: "0px" },
      );
      heroObserver.observe(hero);
      observers.push(heroObserver);
    }

    const coverTargets = [finalCta, footer].filter(
      (el): el is Element => Boolean(el),
    );
    if (coverTargets.length > 0) {
      const coverVisible = new Set<Element>();
      const coverObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) coverVisible.add(entry.target);
            else coverVisible.delete(entry.target);
          }
          coverIn = coverVisible.size > 0;
          sync();
        },
        { root: null, threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
      );
      coverTargets.forEach((el) => coverObserver.observe(el));
      observers.push(coverObserver);
    }

    sync();
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const className = [
    "marketing-sticky-cta",
    visible ? "is-visible" : "is-hidden",
  ].join(" ");

  return (
    <div className={className} aria-hidden={!visible}>
      <p className="marketing-sticky-cta-label">Ready to run the estate?</p>
      {href.startsWith("#") ? (
        <a
          href={href}
          className="btn-primary marketing-sticky-cta-btn"
          tabIndex={visible ? 0 : -1}
        >
          {label}
        </a>
      ) : (
        <Link
          href={href}
          className="btn-primary marketing-sticky-cta-btn"
          tabIndex={visible ? 0 : -1}
        >
          {label}
        </Link>
      )}
    </div>
  );
}
