/**
 * Release-proof headed smoke for the landlord Friday loop.
 *
 * Uses a short-lived admin-generated session for the dedicated smoke user,
 * avoiding CAPTCHA automation and never printing tokens. Read-only UI checks.
 *
 * Run: node scripts/qa-release-proof.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WEB = path.resolve(__dirname, "..");
const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.QA_EMAIL || "smoke.e2e@smartprop.local";
const OUT = path.join(__dirname, "qa-release-proof");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at).trim();
    const value = line
      .slice(at + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, ".env"));
loadEnv(path.join(WEB, ".env.local"));

const supabaseUrl = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

function createCookieChunks(name, value) {
  const chunks = [];
  for (let offset = 0; offset < value.length; offset += 3180) {
    chunks.push({
      name: value.length <= 3180 ? name : `${name}.${chunks.length}`,
      value: value.slice(offset, offset + 3180),
    });
  }
  return chunks;
}

async function createSmokeSession() {
  if (!supabaseUrl || !serviceKey || !anonKey) {
    throw new Error("Missing Supabase configuration for release-proof QA");
  }

  const generated = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  if (!generated.ok) {
    throw new Error(`Could not create smoke session (${generated.status})`);
  }

  const generatedBody = await generated.json();
  const actionLink =
    generatedBody?.properties?.action_link || generatedBody?.action_link;
  if (!actionLink) throw new Error("Smoke session response has no action link");

  const exchange = await fetch(actionLink, { redirect: "manual" });
  const redirect = exchange.headers.get("location");
  if (!redirect) throw new Error("Smoke session exchange has no redirect");

  const params = new URLSearchParams(new URL(redirect).hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in") || "3600");
  const expiresAt = Number(
    params.get("expires_at") || Math.floor(Date.now() / 1000) + expiresIn,
  );
  if (!accessToken || !refreshToken) {
    throw new Error("Smoke session exchange did not return tokens");
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!userResponse.ok) throw new Error("Could not read smoke user");
  const user = await userResponse.json();
  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: "bearer",
    user,
  };

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;

  return {
    cookies: createCookieChunks(cookieName, encoded),
    async revoke() {
      await fetch(`${supabaseUrl}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      }).catch(() => {});
    },
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const session = await createSmokeSession();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const results = [];
  const consoleErrors = [];

  function note(area, status, detail) {
    results.push({ area, status, detail });
    console.log(`[${status}] ${area}: ${detail}`);
  }

  async function shot(page, name) {
    await page.screenshot({
      path: path.join(OUT, `${name}.png`),
      fullPage: true,
    });
  }

  async function open(page, route, readySelector) {
    await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (readySelector) {
      await page
        .locator(readySelector)
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => {});
    }
    await page.waitForTimeout(400);
    return page.locator("main, .shell-content").innerText();
  }

  try {
    await context.addCookies(
      session.cookies.map((cookie) => ({
        ...cookie,
        domain: "localhost",
        path: "/",
        secure: false,
        sameSite: "Lax",
      })),
    );
    const page = await context.newPage();
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().includes("favicon") &&
        !message.text().includes("metadataBase")
      ) {
        consoleErrors.push(message.text());
      }
    });

    let text = await open(
      page,
      "/properties",
      "#portfolio-occupancy-label, .dashboard-empty, .form-error",
    );
    note(
      "Properties",
      /Properties/i.test(text) && /Occupancy/i.test(text) && /Payment/i.test(text)
        ? "pass"
        : "fail",
      "portfolio title and both filter bands",
    );
    const actionBadge = await page
      .locator('a[href="/reminders"] .nav-item-badge')
      .textContent()
      .catch(() => "");
    const bellBadge = await page
      .locator(".shell-notifications-badge")
      .textContent()
      .catch(() => "");
    note(
      "Chrome badges",
      !actionBadge || !bellBadge || actionBadge !== bellBadge ? "pass" : "fail",
      `Action needed=${actionBadge || "none"}; bell=${bellBadge || "none"}`,
    );
    await page.locator(".shell-notifications-trigger").click();
    const bellText = await page
      .locator(".shell-notifications-panel")
      .innerText();
    note(
      "Bell",
      /Clears when you chase or reply/i.test(bellText) &&
        /Action needed/i.test(bellText)
        ? "pass"
        : "fail",
      "live-summary honesty and Action needed link",
    );
    await shot(page, "01-properties-bell");

    text = await open(
      page,
      "/payments",
      "#payments-list-label, .dashboard-empty, .form-error",
    );
    note(
      "Payments",
      /Money in/i.test(text) && /Overdue/i.test(text) && /Due soon/i.test(text)
        ? "pass"
        : "fail",
      "money-in, overdue, and due-soon segments",
    );
    const chaseClass = await page
      .locator('a[href="/reminders?filter=overdue"]')
      .first()
      .getAttribute("class")
      .catch(() => "");
    note(
      "Payments CTA",
      !chaseClass || chaseClass.includes("btn-secondary") ? "pass" : "fail",
      chaseClass || "no overdue CTA in current fixture",
    );
    await shot(page, "02-payments");

    text = await open(
      page,
      "/reminders",
      "#reminders-status-label, .dashboard-empty, .form-error",
    );
    note(
      "Action needed",
      /Action needed/i.test(text) &&
        /Urgent/i.test(text) &&
        /Overdue/i.test(text) &&
        /Failed/i.test(text)
        ? "pass"
        : "fail",
      "urgent-ranked filters",
    );
    await shot(page, "03-action-needed");

    for (const [route, area, expected] of [
      ["/tenancies", "Tenancies", /Tenanc|Ending soon/i],
      ["/expenses", "Expenses", /Expense/i],
      ["/reports", "Reports", /Report|Rent roll/i],
      ["/work-orders", "Work orders", /Work order|Open|Done/i],
      ["/applications", "Applications", /Application|Pending/i],
    ]) {
      text = await open(page, route, ".page-title, .form-error");
      note(area, expected.test(text) ? "pass" : "fail", new URL(page.url()).pathname);
    }

    await open(page, "/properties", ".page-title");
    await page
      .locator(
        'button[aria-label*="Help"], button[title*="Help"], button:has(svg.lucide-circle-help)',
      )
      .first()
      .click();
    await page.waitForTimeout(300);
    const helpText = await page.locator("body").innerText();
    note(
      "Help",
      /Action needed|rent roll|Expenses/i.test(helpText) ? "pass" : "fail",
      "landlord guidance opens",
    );
    await shot(page, "04-help");

    note(
      "Console",
      consoleErrors.length === 0 ? "pass" : "fail",
      consoleErrors.length
        ? consoleErrors.slice(0, 2).join(" | ")
        : "no captured console errors",
    );
  } finally {
    await browser.close();
    await session.revoke();
  }

  const summary = {
    base: BASE,
    at: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(
    path.join(OUT, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  const failures = results.filter((result) => result.status === "fail");
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
