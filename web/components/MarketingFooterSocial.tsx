import type { ReactNode } from "react";

import {
  brandSocialLinks,
  type BrandSocialId,
} from "@/lib/brand";

const ICON_PATHS: Record<BrandSocialId, ReactNode> = {
  linkedin: (
    <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V20h-4V8.5zM8 8.5h3.8v1.57h.05c.53-1 1.82-2.05 3.75-2.05 4.01 0 4.75 2.64 4.75 6.07V20h-4v-5.2c0-1.24-.02-2.83-1.73-2.83-1.73 0-2 1.35-2 2.74V20H8V8.5z" />
  ),
  x: (
    <path d="M17.5 2.5h-3.1l-4.2 5.5L5.8 2.5H1.5l6.4 8.4L1.2 19.5h3.1l4.6-6 4.8 6h4.3l-6.7-8.7L17.5 2.5zm-2.1 15.4h-1.6L5.7 4.1h1.7l8 13.8z" />
  ),
  instagram: (
    <>
      <rect x="2" y="2" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="14.7" cy="5.3" r="1" fill="currentColor" />
    </>
  ),
  youtube: (
    <path d="M19.6 5.8c-.3-1.1-1.2-1.9-2.3-2.1C15.5 3.3 10 3.3 10 3.3s-5.5 0-7.3.4C1.6 4 0.7 4.8 0.4 5.8 0 7.6 0 10 0 10s0 2.4.4 4.2c.3 1.1 1.2 1.9 2.3 2.1 1.8.4 7.3.4 7.3.4s5.5 0 7.3-.4c1.1-.2 2-1 2.3-2.1.4-1.8.4-4.2.4-4.2s0-2.4-.4-4.2zM8 13.2V6.8L13.2 10 8 13.2z" />
  ),
  whatsapp: (
    <path d="M10 1.8C5.5 1.8 1.8 5.4 1.8 9.9c0 1.5.4 2.9 1.2 4.1L2 18.2l4.3-1.1c1.2.6 2.4 1 3.7 1 4.5 0 8.2-3.6 8.2-8.1S14.5 1.8 10 1.8zm0 14.7c-1.2 0-2.3-.3-3.3-.9l-.2-.1-2.6.7.7-2.5-.1-.3c-.6-1-1-2.2-1-3.4 0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5-2.9 6.5-6.5 6.5zm3.6-4.9c-.2-.1-1.2-.6-1.3-.6-.2-.1-.3-.1-.5.1-.1.2-.5.6-.6.8-.1.1-.2.2-.4.1-.2-.1-.8-.3-1.5-.9-.6-.5-1-1.1-1.1-1.3-.1-.2 0-.3.1-.4.1-.1.2-.2.3-.3.1-.1.1-.2.2-.3.1-.1 0-.2 0-.3 0-.1-.5-1.2-.7-1.6-.2-.4-.4-.4-.5-.4h-.4c-.1 0-.3.1-.5.3-.2.2-.6.6-.6 1.4 0 .9.7 1.7.8 1.8.1.1 1.3 2.1 3.2 2.9 1.9.8 1.9.5 2.3.5.4 0 1.2-.5 1.3-.9.2-.5.2-.8.1-.9z" />
  ),
};

function SocialIcon({ id }: { id: BrandSocialId }) {
  const filled = id !== "instagram";
  return (
    <svg
      viewBox="0 0 20 20"
      width={18}
      height={18}
      aria-hidden
      focusable="false"
    >
      <g fill={filled ? "currentColor" : "none"}>{ICON_PATHS[id]}</g>
    </svg>
  );
}

/** Footer social icons — only renders channels with configured URLs. */
export function MarketingFooterSocial() {
  const links = brandSocialLinks();
  if (links.length === 0) return null;

  return (
    <ul className="marketing-footer-social" aria-label="Social media">
      {links.map((link) => (
        <li key={link.id}>
          <a
            href={link.href}
            className="marketing-footer-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
          >
            <SocialIcon id={link.id} />
          </a>
        </li>
      ))}
    </ul>
  );
}
