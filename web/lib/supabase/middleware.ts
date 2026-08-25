import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAdminEmail } from "@/lib/admin";

const AUTH_ROUTES = new Set(["/login", "/signup", "/forgot-password"]);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  const isPublic =
    isAuthRoute ||
    pathname === "/" ||
    pathname === "/pricing" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/apply/") ||
    pathname === "/tenant/claim" ||
    pathname === "/staff/claim" ||
    pathname === "/artisan/claim";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  async function userIsAdmin(): Promise<boolean> {
    if (isAdminEmail(user?.email)) return true;
    const email = user?.email?.trim();
    if (!email) return false;
    const { data } = await supabase
      .from("admin_allowlist")
      .select("email")
      .ilike("email", email)
      .maybeSingle();
    return Boolean(data?.email);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    if (await userIsAdmin()) {
      url.pathname = "/admin/leads";
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "tenant") {
      url.pathname = "/tenant";
      return NextResponse.redirect(url);
    }
    if (profile?.role === "artisan") {
      url.pathname = "/artisan";
      return NextResponse.redirect(url);
    }

    const { count, error } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true });

    url.pathname =
      !error && (count ?? 0) > 0 ? "/properties" : "/onboarding";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "tenant") {
      const isTenantSurface =
        pathname === "/tenant" ||
        pathname.startsWith("/tenant/") ||
        pathname.startsWith("/apply/") ||
        pathname.startsWith("/auth/");
      if (!isTenantSurface) {
        const url = request.nextUrl.clone();
        url.pathname = "/tenant";
        return NextResponse.redirect(url);
      }
    }
    if (profile?.role === "artisan") {
      const isArtisanSurface =
        pathname === "/artisan" ||
        pathname.startsWith("/artisan/") ||
        pathname.startsWith("/auth/");
      if (!isArtisanSurface) {
        const url = request.nextUrl.clone();
        url.pathname = "/artisan";
        return NextResponse.redirect(url);
      }
    } else if (
      pathname.startsWith("/artisan") &&
      pathname !== "/artisan/claim"
    ) {
      // Claim is allowed before role flips to artisan; other artisan routes are not.
      const url = request.nextUrl.clone();
      url.pathname =
        profile?.role === "tenant" ? "/tenant" : "/properties";
      return NextResponse.redirect(url);
    }
  }

  if (user && (pathname === "/leads" || pathname.startsWith("/leads/"))) {
    const url = request.nextUrl.clone();
    url.pathname = (await userIsAdmin()) ? "/admin/leads" : "/properties";
    return NextResponse.redirect(url);
  }

  if (user && isAdminRoute && !(await userIsAdmin())) {
    const url = request.nextUrl.clone();
    url.pathname = "/properties";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
