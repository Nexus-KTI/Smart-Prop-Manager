import {
  Building2,
  Hammer,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";

type Audience = {
  title: string;
  body: string;
  href: string;
  cta: string;
  Icon: typeof Building2;
};

/** Role doors only, not a second features list. */
const AUDIENCES: Audience[] = [
  {
    title: "Landlords",
    body: "Own the money list and Friday chase.",
    href: "#features",
    cta: "See the list →",
    Icon: Building2,
  },
  {
    title: "Property managers",
    body: "Claim a staff invite, chase across owners without a shared login.",
    href: "/staff/claim",
    cta: "Claim invite →",
    Icon: Users,
  },
  {
    title: "Tenants",
    body: "Claim your invite, pay and request from the portal.",
    href: "/signup?role=tenant",
    cta: "Tenant signup →",
    Icon: UserRound,
  },
  {
    title: "Service pros",
    body: "Claim an artisan invite, take work orders from landlords.",
    href: "/artisan/claim",
    cta: "Artisan claim →",
    Icon: Hammer,
  },
];

export function MarketingAudiences() {
  return (
    <div className="marketing-audience-grid">
      {AUDIENCES.map((a) => (
        <article key={a.title} className="marketing-audience-card">
          <a.Icon className="marketing-audience-icon" aria-hidden size={22} />
          <h3 className="marketing-audience-title">{a.title}</h3>
          <p className="marketing-audience-body">{a.body}</p>
          {a.href.startsWith("/") ? (
            <Link href={a.href} className="marketing-audience-cta">
              {a.cta}
            </Link>
          ) : (
            <a href={a.href} className="marketing-audience-cta">
              {a.cta}
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
