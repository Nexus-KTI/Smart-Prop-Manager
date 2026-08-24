import { OnboardingWizard } from "@/components/OnboardingWizard";
import { BRAND_NAME } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = user?.user_metadata ?? {};
  const userName = String(meta.full_name || meta.name || "").trim();

  return (
    <section className="onboarding-page">
      <p className="onboarding-brand">{BRAND_NAME}</p>
      <OnboardingWizard userName={userName} />
    </section>
  );
}
