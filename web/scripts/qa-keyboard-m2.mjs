/**
 * M2 — Keyboard / focus pass.
 * Run: node scripts/qa-keyboard-m2.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3003";
const EMAIL = process.env.QA_EMAIL || "smoke.e2e@smartprop.local";
const PASS = process.env.QA_PASSWORD || "QaSmokePass!2026";
const UNIT =
  process.env.QA_UNIT_ID || "2ee9478c-11a1-4cd9-8b13-589b299badeb";
const OUT = path.resolve(__dirname, "../../docs/qa-keyboard-m2");
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

async function focusStyle(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) {
      return { tag: "BODY", cls: "", label: "body", visible: false, reason: "no-focus" };
    }
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    const outlineOffset = cs.outlineOffset;
    // Accent border counts for inputs (design system uses border-color: accent).
    const borderAccent =
      cs.borderTopColor.includes("15, 110, 79") || // #0f6e4f light
      cs.borderTopColor.includes("47, 166, 121") || // #2fa679 dark
      cs.borderColor.includes("15, 110, 79") ||
      cs.borderColor.includes("47, 166, 121") ||
      (cs.borderTopWidth !== "0px" &&
        cs.borderTopColor !== cs.getPropertyValue("--border") &&
        el.matches("input, textarea, select, .form-input"));
    // Also accept box-shadow rings if any
    const ring = cs.boxShadow && cs.boxShadow !== "none";
    const label =
      el.getAttribute("aria-label") ||
      el.getAttribute("name") ||
      el.textContent?.trim().slice(0, 40) ||
      el.tagName;
    const visible = outline || borderAccent || ring;
    return {
      tag: el.tagName,
      cls: (el.className || "").toString().slice(0, 80),
      role: el.getAttribute("role") || "",
      label: String(label).replace(/\s+/g, " ").slice(0, 60),
      outline: outline ? `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}` : "none",
      outlineOffset,
      border: cs.borderTopColor,
      visible,
      reason: visible
        ? outline
          ? "outline"
          : borderAccent
            ? "accent-border"
            : "shadow"
        : "no-indicator",
    };
  });
}

async function tabWalk(page, { steps, prefix }) {
  const seen = [];
  let traps = 0;
  let weak = 0;
  let prevKey = "";

  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(40);
    const info = await focusStyle(page);
    const key = `${info.tag}|${info.cls}|${info.label}`;
    if (key === prevKey && info.tag !== "BODY") {
      traps += 1;
    }
    prevKey = key;
    seen.push(info);
    if (!info.visible && info.tag !== "BODY") {
      weak += 1;
      note(
        `${prefix}-focus-${i + 1}`,
        "fail",
        `No focus ring: <${info.tag.toLowerCase()} class="${info.cls}" role="${info.role}"> "${info.label}"`,
      );
    }
  }

  if (traps > 2) {
    note(`${prefix}-trap`, "fail", `Possible keyboard trap (${traps} repeated focuses)`);
  } else {
    note(`${prefix}-trap`, "pass", `No sticky trap across ${steps} tabs`);
  }

  const withRing = seen.filter((s) => s.visible).length;
  note(
    `${prefix}-coverage`,
    weak === 0 ? "pass" : "fail",
    `${withRing}/${seen.length} focused controls showed a ring (${weak} weak)`,
  );
  return { seen, weak, traps };
}

async function loginEmail(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.getByRole("tab", { name: /^Email$/i }).click();
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  try {
    await page.waitForURL(/properties|onboarding/, { timeout: 25000 });
  } catch {
    const err = await page
      .locator(".form-error, [role='alert']")
      .first()
      .textContent()
      .catch(() => "");
    throw new Error(`Login failed. url=${page.url()} err=${err}`);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // --- Login phone path ---
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await tabWalk(page, { steps: 10, prefix: "login-phone" });
  await shot(page, "01-login-phone-focus");

  // Switch to email via keyboard if possible
  const emailTab = page.getByRole("tab", { name: /email/i });
  await emailTab.focus();
  const emailTabFocus = await focusStyle(page);
  note(
    "login-email-tab",
    emailTabFocus.visible ? "pass" : "fail",
    emailTabFocus.visible
      ? `Email tab ring via ${emailTabFocus.reason}`
      : "Email tab has no focus indicator",
  );
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await tabWalk(page, { steps: 8, prefix: "login-email" });
  await shot(page, "02-login-email-focus");

  // Authenticate
  await loginEmail(page);
  note("auth", "pass", `Signed in → ${page.url()}`);

  // --- Unit payments ---
  // Prefer a live unit link from /payments if seeded id is stale.
  await page.goto(`${BASE}/payments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  let unitUrl = `${BASE}/payments/${UNIT}`;
  const unitLink = page.locator('a[href*="/payments/"]').first();
  if (await unitLink.count()) {
    unitUrl = new URL(await unitLink.getAttribute("href"), BASE).toString();
  }
  await page.goto(unitUrl, { waitUntil: "networkidle" });
  await page
    .waitForFunction(() => /Record Manual Payment|Retry|Could not load|No payments/i.test(document.body.innerText), {
      timeout: 20000,
    })
    .catch(() => {});
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await tabWalk(page, { steps: 14, prefix: "payments" });

  const manual = page.getByRole("button", { name: /Record Manual Payment/i });
  if (await manual.count()) {
    await manual.focus();
    const manualFocus = await focusStyle(page);
    note(
      "payments-manual-btn",
      manualFocus.visible ? "pass" : "fail",
      manualFocus.visible ? "Manual CTA has focus ring" : "Manual CTA missing focus ring",
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.locator("body").click({ position: { x: 8, y: 8 } });
    await tabWalk(page, { steps: 10, prefix: "payments-form" });
    await shot(page, "03-payments-form-focus");

    const cancel = page.getByRole("button", { name: /Cancel/i });
    if (await cancel.count()) {
      await cancel.focus();
      const cancelFocus = await focusStyle(page);
      note(
        "payments-cancel",
        cancelFocus.visible ? "pass" : "fail",
        cancelFocus.visible ? "Cancel has focus ring" : "Cancel missing focus ring",
      );
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
    }
  } else {
    note("payments-manual-btn", "fail", `Manual CTA missing on ${unitUrl}`);
    await shot(page, "03-payments-form-focus");
  }

  // --- Reminders Retry ---
  await page.goto(`${BASE}/reminders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  let remUrl = `${BASE}/reminders/${UNIT}`;
  const remLink = page.locator('a[href*="/reminders/"]').first();
  if (await remLink.count()) {
    remUrl = new URL(await remLink.getAttribute("href"), BASE).toString();
  }
  await page.goto(remUrl, { waitUntil: "networkidle" });
  await page
    .waitForFunction(() => /Retry|Send Reminder|No reminders|Could not load/i.test(document.body.innerText), {
      timeout: 20000,
    })
    .catch(() => {});
  const retry = page.getByRole("button", { name: /Retry/i }).first();
  if (await retry.count()) {
    await retry.focus();
    const retryFocus = await focusStyle(page);
    note(
      "reminders-retry",
      retryFocus.visible ? "pass" : "fail",
      retryFocus.visible ? "Retry has focus ring" : "Retry missing focus ring",
    );
  } else {
    note("reminders-retry", "partial", "No Retry button available");
  }
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await tabWalk(page, { steps: 12, prefix: "reminders" });
  await shot(page, "04-reminders-focus");

  // --- Settings tabs ---
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator("body").click({ position: { x: 8, y: 8 } });
  await tabWalk(page, { steps: 16, prefix: "settings" });

  const settingsTabs = page.locator('[role="tab"]');
  const tabCount = await settingsTabs.count();
  if (tabCount === 0) {
    note("settings-tabs", "fail", "No role=tab controls on Settings");
  }
  for (let i = 0; i < tabCount; i++) {
    const tab = settingsTabs.nth(i);
    const name = ((await tab.textContent()) || `tab-${i}`).trim();
    await tab.focus();
    const info = await focusStyle(page);
    note(
      `settings-tab-${name.toLowerCase().replace(/\s+/g, "-")}`,
      info.visible ? "pass" : "fail",
      info.visible
        ? `${name} tab ring via ${info.reason}`
        : `${name} tab has no focus indicator`,
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
  }
  await shot(page, "05-settings-focus");

  // Sidebar nav item focus
  const navPayments = page.getByRole("link", { name: /Payments/i }).first();
  await navPayments.focus();
  const navFocus = await focusStyle(page);
  note(
    "sidebar-nav",
    navFocus.visible ? "pass" : "fail",
    navFocus.visible ? "Sidebar nav has focus ring" : "Sidebar nav missing focus ring",
  );

  const summary = {
    base: BASE,
    at: new Date().toISOString(),
    results,
    fails: results.filter((r) => r.status === "fail").length,
  };
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\nWrote", path.join(OUT, "summary.json"));
  console.log(`Fails: ${summary.fails}`);
  await browser.close();
  if (summary.fails) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
