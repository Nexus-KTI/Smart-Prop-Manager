type AuthRouter = {
  replace: (href: string) => void;
  refresh: () => void;
};

/**
 * Same landing rules from Supabase (RLS) when the API is down or cold, so an
 * existing landlord is never sent into onboarding by mistake.
 */
async function landingFromSupabase(): Promise<string> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "/login";

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "tenant") return "/tenant";
    if (profile?.role === "artisan") return "/artisan";

    const { count, error } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true });
    if (error) return "/properties";
    return (count ?? 0) > 0 ? "/properties" : "/onboarding";
  } catch {
    return "/properties";
  }
}

/**
 * After login or password reset, land each role in the right shell.
 */
export async function redirectAfterAuth(router: AuthRouter) {
  let nextPath: string;
  try {
    const { fetchAdminMe, fetchMe, fetchPropertiesPage } = await import(
      "@/lib/api"
    );
    const profile = await fetchMe();
    if (profile.role === "tenant") {
      nextPath = "/tenant";
    } else if (profile.role === "artisan") {
      nextPath = "/artisan";
    } else {
      const me = await fetchAdminMe();
      if (me.is_admin) {
        nextPath = "/admin/leads";
      } else {
        const page = await fetchPropertiesPage();
        nextPath = page.items.length > 0 ? "/properties" : "/onboarding";
      }
    }
  } catch {
    nextPath = await landingFromSupabase();
  }

  router.replace(nextPath);
  router.refresh();
}
