/**
 * Now-list QA pass (N1–N9 + auth copy + marketing smoke).
 * Run: node docs/qa-now-pass.mjs
 * Requires: Next on :3003, API on :8000, smoke user password set.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3003";
const EMAIL = process.env.QA_EMAIL || "smoke.e2e@smartprop.local";
const PASS = process.env.QA_PASSWORD || "QaSmokePass!2026";
const OUT = path.join(__dirname, "qa-now-screenshots");
const results = [];

function note(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id}: ${detail}`);
}

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: true,
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // --- Unauth: OTP channel copy (N8) ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const loginText = await page.locator(".auth-page").innerText();
  await shot(page, "01-login");
  const hasSms = /SMS/i.test(loginText);
  const hasWhatsAppMismatch =
    /Sign in with WhatsApp/i.test(loginText) && !/SMS/i.test(loginText);
  if (hasSms && !hasWhatsAppMismatch) {
    note("N8-login", "pass", "Login subtitle/help references SMS (channel=sms)");
  } else {
    note("N8-login", "fail", `Unexpected OTP copy. Snippet: ${loginText.slice(0, 200)}`);
  }

  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  const signupText = await page.locator(".auth-page").innerText().catch(() => "");
  await shot(page, "02-signup");
  if (/SMS/i.test(signupText)) {
    note("N8-signup", "pass", "Signup references SMS");
  } else if (/invite|request/i.test(signupText)) {
    note("N8-signup", "pass", "Signup gated (invite-only); page rendered");
  } else {
    note("N8-signup", "partial", `Signup copy unclear: ${signupText.slice(0, 160)}`);
  }

  // --- Marketing smoke ---
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await shot(page, "03-marketing");
  const brand = await page.locator(".marketing-brand").first().textContent();
  const container = await page.locator(".marketing-container").first().boundingBox();
  if (brand?.includes("Smart Prop") && container && container.width <= 744) {
    note("marketing", "pass", `Brand present; container ~${Math.round(container.width)}px`);
  } else {
    note("marketing", "partial", `brand=${brand} width=${container?.width}`);
  }

  // --- Auth: email login ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const emailTab = page.getByRole("button", { name: /email/i }).or(
    page.getByRole("tab", { name: /email/i }),
  );
  if (await emailTab.count()) {
    await emailTab.first().click();
  } else {
    // try link/text switch
    const switcher = page.locator("text=/email/i").first();
    if (await switcher.count()) await switcher.click();
  }
  await page.waitForTimeout(300);

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  if (!(await emailInput.count()) || !(await passInput.count())) {
    note("auth", "fail", "Email/password fields not found on login");
    await finish();
    await browser.close();
    return;
  }
  await emailInput.fill(EMAIL);
  await passInput.fill(PASS);
  await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
  await page.waitForURL(/properties|onboarding|settings/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "04-post-login");
  const url = page.url();
  if (!/properties|onboarding/.test(url)) {
    const err = await page.locator(".form-error, [role='alert']").first().textContent().catch(() => "");
    note("auth", "fail", `Did not land on app. url=${url} err=${err}`);
    await finish();
    await browser.close();
    return;
  }
  note("auth", "pass", `Signed in → ${url}`);

  // --- Properties / Skip visibility (N6) ---
  await page.goto(`${BASE}/properties`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "05-properties");
  const propsText = await page.locator("main, .shell-content").innerText();
  const hasAddUnit = /Add unit/i.test(propsText);
  const hasNeedsUnit = /no unit|needs a unit|Add your first unit|Add unit/i.test(propsText);
  const hasTable = (await page.locator("table, .data-table-wrap").count()) > 0;
  if (hasTable || hasNeedsUnit) {
    note("N6", "pass", `Properties shows portfolio UI (table=${hasTable}, addUnit=${hasAddUnit})`);
  } else if (/No units yet|Add your first|Get started/i.test(propsText)) {
    note("N6", "partial", "Empty portfolio — Skip path needs onboarding exercise");
  } else {
    note("N6", "fail", `Unexpected properties state: ${propsText.slice(0, 180)}`);
  }

  // --- Unit payments (N1, N4, N7) ---
  await page.goto(`${BASE}/payments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "06-payments-list");
  const unitLink = page.locator('a[href*="/payments/"]').first();
  if (await unitLink.count()) {
    await unitLink.click();
    // Wait out dynamic import + 12s fetch timeout path; prefer settled UI.
    await page
      .waitForFunction(() => {
        const root = document.querySelector("main, .shell-content");
        const text = root?.textContent || "";
        const busy = document.querySelector('[aria-busy="true"]');
        const settled =
          /Record Manual Payment|Record manual payment|Pay with Paystack|Retry|Could not load|doesn't exist|No payments yet/i.test(
            text,
          );
        return settled && !busy;
      }, { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "07-unit-payments");
    const payText = await page.locator("main, .shell-content").innerText();
    const stuckSkeleton =
      (await page.locator('[aria-busy="true"]').count()) > 0 &&
      !/Record|Manual|Paystack|Retry|Could not load|No payments/i.test(payText);
    if (stuckSkeleton) {
      note("N1", "fail", "Unit payments appears stuck on skeleton after 20s");
    } else if (/Something went wrong|Could not load|Retry/i.test(payText) && /Retry/i.test(payText)) {
      note("N1", "pass", "FetchErrorState + Retry visible (API/data error path)");
    } else if (/Record Manual Payment|Record manual payment/i.test(payText)) {
      note("N1", "pass", "Unit payments loaded with actions (not stuck)");
    } else {
      note("N1", "partial", `Loaded but unexpected copy: ${payText.slice(0, 200)}`);
    }

    const manual = page.locator(".btn-primary", { hasText: /manual/i });
    const paystack = page.locator(".btn-outline", { hasText: /Paystack/i });
    if ((await manual.count()) && (await paystack.count())) {
      note("N4", "pass", "Manual = primary, Paystack = outline");
    } else {
      note("N4", "fail", `CTA hierarchy missing manual=${await manual.count()} paystack=${await paystack.count()}`);
    }

    if (/Download receipt/i.test(payText)) {
      note("N7", "pass", "Download receipt label present");
    } else if (/View Receipt|View receipt/i.test(payText)) {
      note("N7", "fail", "Still using View Receipt wording");
    } else {
      note("N7", "partial", "No receipt link in current history (label unverified on row)");
    }

    // N2: open manual form, submit small payment if possible
    if (await manual.count()) {
      await manual.first().click();
      await page.waitForTimeout(400);
      const amount = page.locator('input[name="amount"], input[inputmode="decimal"]').first();
      const ref = page.locator('input[name="reference"], input[name="note"]').first();
      if (await amount.count()) {
        await amount.fill("1000");
        if (await ref.count()) await ref.fill(`qa-${Date.now()}`);
        const submit = page.getByRole("button", { name: /save|record|log/i }).first();
        if (await submit.count()) {
          await submit.click();
          await page.waitForTimeout(2500);
          await shot(page, "08-manual-payment");
          const after = await page.locator("main, .shell-content").innerText();
          const formClosed =
            (await page.locator('input[name="amount"]:visible').count()) === 0 ||
            !(await page.locator("form").filter({ hasText: /amount|reference/i }).count());
          if (/PAID|Download receipt|₦1,000|1000/i.test(after)) {
            note("N2", formClosed || /Record Manual Payment/i.test(after) ? "pass" : "partial", "Manual payment saved; form reset/close checked");
          } else if (/error|failed|Could not/i.test(after)) {
            note("N2", "fail", `Manual payment failed: ${after.slice(0, 160)}`);
          } else {
            note("N2", "partial", "Submit attempted; success unclear");
          }
        } else {
          note("N2", "partial", "Manual form open but no submit button found");
        }
      } else {
        note("N2", "partial", "Could not find amount field");
      }
    }
  } else {
    note("N1", "partial", "No unit payment links — empty payments list");
    note("N4", "partial", "Skipped — no unit");
    note("N2", "partial", "Skipped — no unit");
    note("N7", "partial", "Skipped — no unit");
  }

  // --- Reminders (N3) ---
  await page.goto(`${BASE}/reminders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "09-reminders");
  const remLink = page.locator('a[href*="/reminders/"]').first();
  if (await remLink.count()) {
    await remLink.click();
    await page
      .waitForFunction(() => {
        const text = document.querySelector("main, .shell-content")?.textContent || "";
        return /Retry|Send reminder|No reminders|failed|QA seeded|Could not load/i.test(text);
      }, { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "10-unit-reminders");
    const remText = await page.locator("main, .shell-content").innerText();
    if (/Retry/i.test(remText) && /failed|skipped|Send failed|error|QA seeded/i.test(remText)) {
      note("N3", "pass", "Failed/skipped row shows Retry (+ detail path available)");
    } else if (/No reminders|Send reminder|Reminder/i.test(remText)) {
      note("N3", "partial", "Unit reminders UI loaded; no failed row to exercise Retry");
    } else {
      note("N3", "fail", `Unexpected reminders UI: ${remText.slice(0, 160)}`);
    }
  } else {
    note("N3", "partial", "No unit reminder links");
  }

  // --- Settings (N5) ---
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const early = await page.locator("main, .shell-content").innerText();
  await page.waitForTimeout(2000);
  await shot(page, "11-settings");
  const settingsText = await page.locator("main, .shell-content").innerText();
  const flashDash = /Profile/.test(early) && /\n—\n|\?\s*$/m.test(early);
  const themeCount = await page.locator("button, [role='switch']").filter({ hasText: /theme|dark|light|appearance/i }).count();
  const themeToggle = await page.locator(".theme-toggle, [data-theme-toggle], button:has-text('Dark'), button:has-text('Light')").count();
  if (/Retry|Could not load/i.test(settingsText) && /Profile|Settings/i.test(settingsText)) {
    note("N5-load", "pass", "Settings error/retry path present");
  } else if (/Save|Profile|Business|Email/i.test(settingsText)) {
    note("N5-load", flashDash ? "partial" : "pass", "Settings profile rendered after load");
  } else {
    note("N5-load", "fail", `Settings unexpected: ${settingsText.slice(0, 160)}`);
  }

  // User menu: should not have Account/Settings duplicate
  const menuBtn = page.locator("button").filter({ hasText: /@|Account|smoke|Smoke|menu/i }).first();
  if (await page.locator(".user-menu, [aria-label*='User'], [aria-label*='account' i]").count()) {
    await page.locator(".user-menu button, [aria-label*='User']").first().click().catch(() => {});
  } else {
    // try avatar/button in topbar
    await page.locator(".shell-topbar button, header button").last().click().catch(() => {});
  }
  await page.waitForTimeout(400);
  await shot(page, "12-user-menu");
  const menuText = await page.locator("body").innerText();
  // Look for menu panel links
  const menuPanel = page.locator(".user-menu-panel, [role='menu'], .menu-popover");
  let menuPanelText = "";
  if (await menuPanel.count()) menuPanelText = await menuPanel.first().innerText();
  if (/Account|Settings/i.test(menuPanelText)) {
    note("N5-dedupe", "fail", `User menu still has Account/Settings: ${menuPanelText.slice(0, 120)}`);
  } else {
    note("N5-dedupe", "pass", "No Account/Settings duplicate in user menu panel (or panel closed)");
  }

  // Theme only in settings
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const hasThemeInSettings =
    (await page.locator('.theme-segment, [aria-label="Appearance"]').count()) > 0 ||
    (await page.getByText(/appearance|Dark|Light/i).count()) > 0;
  note(
    "N5-theme",
    hasThemeInSettings ? "pass" : "partial",
    hasThemeInSettings ? "Theme control present in Settings" : "Theme control not found",
  );

  // --- Address autocomplete (N9) on new property ---
  await page.goto(`${BASE}/properties/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const addr = page.locator('input[name="address"], input[autocomplete="street-address"], .address-autocomplete input').first();
  if (await addr.count()) {
    await addr.fill("zzzznonexistentplace99999");
    await page.waitForTimeout(4500);
    await shot(page, "13-address-autocomplete");
    const addrUi = await page.locator(".address-autocomplete, form").first().innerText();
    if (/No matches|Suggestions unavailable|Search is slow|unavailable/i.test(addrUi)) {
      note("N9", "pass", "Autocomplete edge copy shown");
    } else if ((await page.locator(".address-autocomplete-dropdown li, [role='option']").count()) === 0) {
      note("N9", "pass", "No broken empty dropdown list after nonsense query");
    } else {
      note("N9", "partial", `Edge copy not seen; UI: ${addrUi.slice(0, 140)}`);
    }
  } else {
    note("N9", "partial", "Address field not found on /properties/new");
  }

  await finish();
  await browser.close();
}

async function finish() {
  const summaryPath = path.join(OUT, "summary.json");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
  console.log("\nWrote", summaryPath);
  const fails = results.filter((r) => r.status === "fail");
  if (fails.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
