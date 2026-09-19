"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BRAND_NAME, BRAND_STAMP } from "@/lib/brand";

type Props = {
  inviteOnly: boolean;
};

const NAV_LINKS = [
  { href: "/#product", label: "Product", match: null },
  { href: "/#audiences", label: "Roles", match: null },
  { href: "/pricing", label: "Pricing", match: "/pricing" },
] as const;

function PrimaryCta({
  href,
  label,
  className,
  onClick,
}: {
  href: string;
  label: string;
  className: string;
  onClick?: () => void;
}) {
  if (href.startsWith("/#") || href.startsWith("#")) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className} onClick={onClick}>
      {label}
    </Link>
  );
}

/** Sticky pill header with desktop links + animated mobile menu. */
export function MarketingHeader({ inviteOnly }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const burgerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();
  const primaryLabel = inviteOnly ? "Request access" : "Start free";
  const primaryHref = inviteOnly ? "/#get-started" : "/signup";

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      firstLinkRef.current?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        burgerRef.current?.focus();
      }
    }

    function onResize() {
      if (window.matchMedia("(min-width: 901px)").matches) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <header className="marketing-top" data-menu-open={open ? "true" : undefined}>
      <div className="marketing-top-shell">
        <div className="marketing-top-inner">
          <Link href="/" className="marketing-logo" onClick={closeMenu}>
            <span className="marketing-logo-mark" aria-hidden="true">
              <BrandMark size={28} />
            </span>
            <span className="marketing-logo-text">
              <span className="marketing-logo-name">{BRAND_NAME}</span>
              <span className="marketing-logo-stamp">{BRAND_STAMP}</span>
            </span>
          </Link>

          <nav className="marketing-nav" aria-label="Marketing">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="marketing-nav-link"
                data-active={
                  link.match && pathname.startsWith(link.match) ? "true" : undefined
                }
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="marketing-top-actions">
            <ThemeToggle variant="icon" className="marketing-theme-toggle" />
            <Link href="/login" className="marketing-nav-signin">
              Log in
            </Link>
            <PrimaryCta
              href={primaryHref}
              label={primaryLabel}
              className="btn-primary marketing-nav-cta"
            />
            <button
              ref={burgerRef}
              type="button"
              className="marketing-nav-burger"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls={menuId}
              onClick={() => setOpen((current) => !current)}
            >
              <span className="marketing-nav-burger-lines" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>

        <nav
          id={menuId}
          className="marketing-mobile-nav"
          aria-label="Marketing mobile"
          aria-hidden={!open}
          inert={!open ? true : undefined}
        >
          <div className="marketing-mobile-nav-panel">
            {NAV_LINKS.map((link, index) => (
              <Link
                key={link.href}
                ref={index === 0 ? firstLinkRef : undefined}
                href={link.href}
                className="marketing-mobile-nav-link"
                style={{ "--nav-i": index } as CSSProperties}
                data-active={
                  link.match && pathname.startsWith(link.match) ? "true" : undefined
                }
                onClick={closeMenu}
              >
                <span className="marketing-mobile-nav-index" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="marketing-mobile-nav-label">{link.label}</span>
              </Link>
            ))}
            <div className="marketing-mobile-nav-foot">
              <Link
                href="/login"
                className="marketing-mobile-nav-login"
                onClick={closeMenu}
              >
                Log in
              </Link>
            </div>
          </div>
        </nav>
      </div>

      <button
        type="button"
        className="marketing-mobile-nav-backdrop"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => {
          closeMenu();
          burgerRef.current?.focus();
        }}
      />
    </header>
  );
}
