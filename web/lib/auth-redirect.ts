type AuthRouter = {
  replace: (href: string) => void;
  refresh: () => void;
};

/**
 * After login or password reset, land each role in the right shell.
 */
export async function redirectAfterAuth(router: AuthRouter) {
  let nextPath = "/onboarding";
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
        if (page.items.length > 0) nextPath = "/properties";
      }
    }
  } catch {
    /* new landlords without API access land on onboarding */
  }

  router.replace(nextPath);
  router.refresh();
}
