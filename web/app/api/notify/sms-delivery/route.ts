import { NextRequest, NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * SMS delivery diagnostics — admin session required.
 * Do not expose NOTIFY_DIAG_SECRET to anonymous browsers (OTP recon).
 */
export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone")?.trim() ?? "";
  if (!phone || phone.length < 8) {
    return NextResponse.json({ detail: "phone required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const secret = (process.env.NOTIFY_DIAG_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json(
      { detail: "SMS delivery diagnostics are disabled" },
      { status: 503 },
    );
  }

  const base = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");

  try {
    const res = await fetch(
      `${base}/notify/sms-delivery?phone=${encodeURIComponent(phone)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { "X-Notify-Diag-Secret": secret },
      },
    );
    const body = await res.json().catch(() => ({}));
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(
      { detail: "Could not check SMS delivery status" },
      { status: 502 },
    );
  }
}
