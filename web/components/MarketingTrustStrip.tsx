const FACTS = [
  {
    label: "Unit truth",
    body: "Money, docs, repairs, and access on one trail",
  },
  {
    label: "Role doors",
    body: "Landlord, staff, tenant, artisan - invite-scoped",
  },
  {
    label: "Nigeria-native",
    body: "Cash, transfer, card, WhatsApp",
  },
] as const;

/** Compact trust rail under hero - three facts, not a card parade. */
export function MarketingTrustStrip() {
  return (
    <ul
      className="marketing-trust marketing-trust-rail"
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
