import type { LucideIcon } from "lucide-react";

import { RevealItem } from "@/components/RevealItem";

export type MarketingFeature = {
  title: string;
  body: string;
  reassure?: string;
  Icon: LucideIcon;
  step?: string;
};

type Variant = "cards" | "grid" | "rail";

type Props = {
  items: readonly MarketingFeature[];
  variant?: Variant;
};

const VARIANT_CLASS: Record<
  Variant,
  { list: string; item: string; ordered: boolean }
> = {
  cards: {
    list: "marketing-list",
    item: "marketing-list-item",
    ordered: false,
  },
  grid: {
    list: "marketing-features",
    item: "marketing-feature",
    ordered: false,
  },
  rail: {
    list: "marketing-steps",
    item: "marketing-step",
    ordered: true,
  },
};

/** Reusable feature / problem / step list with scroll reveal. */
export function MarketingFeatureList({
  items,
  variant = "cards",
}: Props) {
  const { list, item, ordered } = VARIANT_CLASS[variant];
  const ListTag = ordered ? "ol" : "ul";

  return (
    <ListTag className={list}>
      {items.map((entry, index) => {
        const Icon = entry.Icon;
        return (
          <RevealItem
            key={entry.title}
            className={item}
            delayMs={index * 80}
          >
            {variant === "rail" && entry.step ? (
              <div className="marketing-step-meta">
                <p className="marketing-step-num mono-data">{entry.step}</p>
              </div>
            ) : (
              <Icon
                className="marketing-card-icon"
                size={20}
                strokeWidth={1.75}
                aria-hidden
              />
            )}
            <div className="marketing-feature-copy">
              <h3 className="marketing-h3">{entry.title}</h3>
              <p>{entry.body}</p>
              {entry.reassure ? (
                <p className="marketing-reassure">{entry.reassure}</p>
              ) : null}
            </div>
          </RevealItem>
        );
      })}
    </ListTag>
  );
}
