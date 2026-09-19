import { BRAND_NAME } from "@/lib/brand";

type BrandMarkProps = {
  className?: string;
  /** Pixel size (square). Default 20 for sidebar collapsed mark. */
  size?: number;
  title?: string;
};

/** Option B mark — N + ledger cuts. Uses currentColor. */
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
        d="M5 4h8.5v9L21 4h6v24h-8.5v-9L11 28H5V4zm3.5 9h15v2h-15v-2zm0 5.5h15v2h-15v-2z"
      />
    </svg>
  );
}

type BrandLogoProps = {
  className?: string;
  markSize?: number;
  /** Show wordmark next to mark (Product lockup). */
  showName?: boolean;
  /** Show by KTI stamp text (not the orange box — CSS handles stamp color). */
  showStamp?: boolean;
  stamp?: string;
};

/** Product lockup: Mark + optional wordmark. Tagline stays marketing-only. */
export function BrandLogo({
  className,
  markSize = 22,
  showName = true,
  showStamp = false,
  stamp,
}: BrandLogoProps) {
  return (
    <span className={className}>
      <BrandMark size={markSize} />
      {showName ? <span className="brand-logo-name">{BRAND_NAME}</span> : null}
      {showStamp && stamp ? (
        <span className="brand-logo-stamp">{stamp}</span>
      ) : null}
    </span>
  );
}
