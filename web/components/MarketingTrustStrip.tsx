const FACTS = [
  { label: "Money truth", body: "Who paid, who owes, what was chased" },
  { label: "Cash still works", body: "Record payment. Paystack optional" },
  { label: "Bills & renewals", body: "Service charge and term end on the unit" },
  { label: "Free to first value", body: "No hard paywall once you’re in" },
] as const;

/** Compact trust band — job labels, no LIVE spam. */
export function MarketingTrustStrip() {
  return (
    <ul className="marketing-trust" aria-label="Today on Nexora">
      {FACTS.map((fact) => (
        <li key={fact.label} className="marketing-trust-item">
          <p className="marketing-trust-label mono-data">{fact.label}</p>
          <p className="marketing-trust-body">{fact.body}</p>
        </li>
      ))}
    </ul>
  );
}
