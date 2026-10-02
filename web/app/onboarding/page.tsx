import { redirect } from "next/navigation";

import { BrandMark, BrandStamp, BrandWordmark } from "@/components/BrandMark";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { count, error } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true });
    if (!error && (count ?? 0) > 0) redirect("/dashboard");
  }

  const meta = user?.user_metadata ?? {};
  const userName = String(meta.full_name || meta.name || "").trim();

  return (
    <section className="onboarding-page">
      <p className="onboarding-brand">
        <span className="auth-brand-mark" aria-hidden="true">
          <BrandMark size={22} />
        </span>
        <span className="auth-brand-text">
          <BrandWordmark />
          <BrandStamp className="marketing-brand-stamp" />
        </span>
      </p>
      <OnboardingWizard userName={userName} />
    </section>
  );
}
