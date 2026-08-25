const FACTS = [
  {
    label: "Honest reminders",
    body: "Failure detail you can act on, not a silent send",
  },
  {
    label: "One ledger",
    body: "Cash, transfer, and Paystack on the same list",
  },
  {
    label: "Scoped staff",
    body: "Managers and caretakers without a shared login",
  },
  {
    label: "Free to first value",
    body: "No hard paywall once you’re in",
  },
] as const;

/** Trust band under hero, outcome chips, not a second feature parade. */
export function MarketingTrustStrip() {
  return (
    <ul
      className="marketing-trust marketing-trust-cards"
      aria-label="Why landlords choose Nexora"
    >
      {FACTS.map((fact) => (
        <li key={fact.label} className="marketing-trust-item">
          <p className="marketing-trust-label">{fact.label}</p>
          <p className="marketing-trust-body">{fact.body}</p>
        </li>
      ))}
    </ul>
  );
}
