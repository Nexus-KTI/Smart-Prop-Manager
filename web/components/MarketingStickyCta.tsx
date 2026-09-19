"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  label: string;
  href: string;
};

/**
 * Mobile-only conversion bar. Hides when the final CTA section is on screen
 * so it doesn’t cover the form.
 */
export function MarketingStickyCta({ label, href }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const target = document.getElementById("get-started");
    if (!target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting);
      },
      { root: null, threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
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
