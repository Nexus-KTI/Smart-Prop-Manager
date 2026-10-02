import { BRAND_COMPANY } from "@/lib/brand";

type BrandMarkProps = {
  className?: string;
  /** Pixel size (square). Default 20 for sidebar collapsed mark. */
  size?: number;
  title?: string;
};

/** N mark. Paths are copied from web/public/brand/mark.svg by scripts/sync_brand_mark.py. */
export function BrandMark({
  className,
  size = 20,
  title,
}: BrandMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path fill="var(--mark)" fillRule="evenodd" d="M4 12H10V29H4ZM22 4H28V29H22Z" />
      <path fill="var(--mark-deep)" fillRule="evenodd" d="M10 12L16 12L28 29L22 29Z" />
      <path fill="var(--brand)" d="M23 3H28V9H23Z" />
    </svg>
  );
}

/** Lowercase wordmark. The leaf sits in the counter of the o. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-wordmark ${className}` : "brand-wordmark"}>
      nex
      <span className="brand-wordmark-o">
        o
        <svg className="brand-wordmark-leaf" viewBox="0 0 10 12" aria-hidden="true">
          <path
            fill="currentColor"
            d="M5.2 11C5.2 11 1.4 7.6 1.4 4.6 1.4 2.4 3.2 1 5 1c1.6 0 3.2 1.1 3.4 3.1C8.6 6.6 6.4 9.2 5.2 11Z"
          />
        </svg>
      </span>
      ra
    </span>
  );
}

/** Parent stamp: "by" + KTI in a --brand box. Size comes from the surface class. */
export function BrandStamp({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-stamp ${className}` : "brand-stamp"}>
      by <span className="brand-stamp-box">{BRAND_COMPANY}</span>
    </span>
  );
}
