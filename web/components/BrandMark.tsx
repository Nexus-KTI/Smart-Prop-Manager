import { BRAND_COMPANY } from "@/lib/brand";

type BrandMarkProps = {
  className?: string;
  /** Pixel size (square). Default 20 for sidebar collapsed mark. */
  size?: number;
  title?: string;
};

/** Ledger N. Path `d` is copied from web/public/brand/mark.svg by scripts/sync_brand_mark.py. Uses currentColor. */
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
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5 4H11L21.667 20H27V28H21L10.333 12H5ZM21 4H27V12H21ZM5 14H11V18H5ZM21 14H27V18H21ZM5 20H11V28H5Z"
      />
    </svg>
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
