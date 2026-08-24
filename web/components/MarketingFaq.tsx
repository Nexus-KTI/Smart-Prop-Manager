"use client";

import { useId, useState } from "react";

type FaqItem = {
  question: string;
  answer: string;
};

export function MarketingFaq({ items }: { items: readonly FaqItem[] }) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="marketing-faq">
      {items.map((item, index) => {
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        const isOpen = openIndex === index;

        return (
          <div key={item.question} className="marketing-faq-item">
            <h3 className="marketing-faq-heading">
              <button
                id={buttonId}
                type="button"
                className="marketing-faq-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpenIndex((current) => (current === index ? null : index))
                }
              >
                <span className="marketing-faq-q">{item.question}</span>
                <span className="marketing-faq-icon" aria-hidden>
                  {isOpen ? "−" : "+"}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="marketing-faq-panel"
              hidden={!isOpen}
            >
              <p className="marketing-faq-a">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
