import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import {
  type AccessTokenClaims,
  formatLastSeen,
  LAST_SEEN_COOKIE,
  LAST_SEEN_REFRESH_SECONDS,
  parseLastSeen,
  policyKindFor,
  readAccessTokenClaims,
  sessionExpiry,
} from "@/lib/sessionPolicy";

const AUTH_ROUTES = new Set(["/login", "/signup", "/forgot-password"]);

function isPublicPath(pathname: string): boolean {
  return (
    AUTH_ROUTES.has(pathname) ||
    pathname === "/" ||
    pathname === "/pricing" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/apply/") ||
    pathname.startsWith("/list/") ||
    pathname === "/tenant/claim" ||
    pathname === "/staff/claim" ||
    pathname === "/artisan/claim"
  );
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  ).trim();

  // Missing public Supabase env crashes createServerClient and surfaces as
  // MIDDLEWARE_INVOCATION_FAILED on Vercel. Fail open for public routes only.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublicPath(request.nextUrl.pathname)) {
      return NextResponse.next({ request });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });

  const cookieOptions = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
      cookiesToSet.forEach(({ name, value }) => {
        request.cookies.set(name, value);
      });
      supabaseResponse = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) => {
        supabaseResponse.cookies.set(name, value, options);
      });
    },
  };

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: cookieOptions,
    });
  } catch (error) {
    console.error("[middleware] createServerClient failed", error);
    return supabaseResponse;
  }

  let user: Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"] = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    console.error("[middleware] getUser failed", error);
    return supabaseResponse;
  }

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = AUTH_ROUTES.has(pathname);
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPublic = isPublicPath(pathname);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  let rolePromise: Promise<string | null> | null = null;
  function getRole(): Promise<string | null> {
    const userId = user?.id;
    if (!userId) return Promise.resolve(null);
    rolePromise ??= (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      return (profile?.role as string | undefined) ?? null;
    })();
    return rolePromise;
  }

  let pendingLastSeen: string | null = null;
  if (user) {
    const now = Date.now() / 1000;
    let claims: AccessTokenClaims = { sessionId: null, authAt: null };
    try {
      const { data } = await supabase.auth.getSession();
      claims = readAccessTokenClaims(data.session?.access_token);
    } catch {
      // Claims unavailable: fall through without enforcing.
    }
    const lastSeen = parseLastSeen(
      request.cookies.get(LAST_SEEN_COOKIE)?.value,
      claims.sessionId,
    );
    const kind = policyKindFor(
      await getRole(),
      isAdminEmail(user.email) || isAdminRoute,
    );
    const expiry = sessionExpiry({
      kind,
      authAt: claims.authAt,
      lastSeen,
      now,
    });

    if (expiry) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (error) {
        console.error("[middleware] expired session signOut failed", error);
      }
      let response = supabaseResponse;
      if (!isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        url.searchParams.set("expired", "1");
        response = NextResponse.redirect(url);
        supabaseResponse.cookies
          .getAll()
          .forEach((cookie) => response.cookies.set(cookie));
      }
      response.cookies.delete(LAST_SEEN_COOKIE);
      return response;
    }

    if (
      claims.sessionId &&
      (lastSeen === null || now - lastSeen > LAST_SEEN_REFRESH_SECONDS)
    ) {
      pendingLastSeen = formatLastSeen(claims.sessionId, now);
    }
  }

  function withLastSeen(response: NextResponse): NextResponse {
    if (pendingLastSeen) {
      response.cookies.set(LAST_SEEN_COOKIE, pendingLastSeen, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
    }
    return response;
  }

  async function mfaPending(): Promise<boolean> {
    if (!user) return false;
    try {
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aal) return false;
      return aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
    } catch {
      return false;
    }
  }

  // MFA enrolled but session still AAL1: keep on login, block app shells.
  if (user && (await mfaPending())) {
    if (!isAuthRoute && !pathname.startsWith("/auth/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("mfa", "1");
      return NextResponse.redirect(url);
    }
    return withLastSeen(supabaseResponse);
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

    const role = await getRole();
    if (role === "tenant") {
      url.pathname = "/tenant";
      return NextResponse.redirect(url);
    }
    if (role === "artisan") {
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
    const role = await getRole();
    if (role === "tenant") {
      const isTenantSurface =
        pathname === "/" ||
        pathname === "/pricing" ||
        pathname === "/tenant" ||
        pathname.startsWith("/tenant/") ||
        pathname.startsWith("/apply/") ||
        pathname.startsWith("/list/") ||
        pathname.startsWith("/auth/");
      if (!isTenantSurface) {
        const url = request.nextUrl.clone();
        url.pathname = "/tenant";
        return NextResponse.redirect(url);
      }
    }
    if (role === "artisan") {
      const isArtisanSurface =
        pathname === "/" ||
        pathname === "/pricing" ||
        pathname === "/artisan" ||
        pathname.startsWith("/artisan/") ||
        pathname.startsWith("/list/") ||
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
        role === "tenant" ? "/tenant" : "/properties";
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

  return withLastSeen(supabaseResponse);
}
