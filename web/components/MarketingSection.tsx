import type { ReactNode } from "react";

type Props = {
  id?: string;
  headingId: string;
  title: string;
  lede?: string;
  alt?: boolean;
  className?: string;
  children: ReactNode;
};

/** Shared marketing section chrome: container, heading, optional lede, alt band. */
export function MarketingSection({
  id,
  headingId,
  title,
  lede,
  alt = false,
  className = "",
  children,
}: Props) {
  const sectionClass = [
    "marketing-section",
    "section-spacing",
    alt ? "section-bg-alt" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section id={id} className={sectionClass} aria-labelledby={headingId}>
      <div className="marketing-container">
        <h2 id={headingId} className="marketing-h2">
          {title}
        </h2>
        {lede ? <p className="marketing-section-lede">{lede}</p> : null}
        {children}
      </div>
    </section>
  );
}
