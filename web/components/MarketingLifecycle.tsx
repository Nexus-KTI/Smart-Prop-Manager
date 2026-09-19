const STEPS = [
  {
    title: "Interest",
    body: "Apply link from the unit. Review in one place.",
  },
  {
    title: "Move-in",
    body: "Checklist, docs, tenant invite and claim.",
  },
  {
    title: "Rent & bills",
    body: "Who paid, who owes, honest chase.",
  },
  {
    title: "Ops",
    body: "Repairs, artisans, access, messages.",
  },
  {
    title: "Renew",
    body: "Term-end on the unit - no surprise Friday.",
  },
] as const;

/** Occupancy spine - how Estate OS modules hang together. */
export function MarketingLifecycle() {
  return (
    <ol className="marketing-lifecycle" aria-label="Occupancy lifecycle">
      {STEPS.map((step, index) => (
        <li key={step.title} className="marketing-lifecycle-step">
          <span className="marketing-lifecycle-index mono-data">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="marketing-lifecycle-title">{step.title}</h3>
          <p className="marketing-lifecycle-body">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
