const QUOTES = [
  {
    quote:
      "I finally see who paid without scrolling three WhatsApp groups. The overdue list is what I open on Friday.",
    name: "Ada O.",
    role: "Landlord · Lagos",
  },
  {
    quote:
      "Tenants message and raise repairs on the unit. Cash still works, we just stop losing the trail.",
    name: "Chinedu B.",
    role: "Estate caretaker",
  },
  {
    quote:
      "Reminders that show when they fail beat silent “sent.” Chase is still work, but it’s honest work.",
    name: "Funke A.",
    role: "Portfolio landlord",
  },
] as const;

/** TC-style social proof, illustrative early-landlord voice, not fake review stars. */
export function MarketingTestimonials() {
  return (
    <div className="marketing-testimonials">
      {QUOTES.map((q) => (
        <figure key={q.name} className="marketing-testimonial-card">
          <blockquote className="marketing-testimonial-quote">
            “{q.quote}”
          </blockquote>
          <figcaption className="marketing-testimonial-meta">
            <span className="marketing-testimonial-name">{q.name}</span>
            <span className="marketing-testimonial-role">{q.role}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
