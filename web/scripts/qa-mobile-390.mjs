/**
 * Mobile 390 regression — properties, money-in feed, unit payments, reminders.
 * Run: QA_BASE_URL=http://localhost:3004 node scripts/qa-mobile-390.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.QA_BASE_URL || "http://localhost:3004";
const EMAIL = process.env.QA_EMAIL || "smoke.e2e@smartprop.local";
const PASS = process.env.QA_PASSWORD || "QaSmokePass!2026";
const UNIT =
  process.env.QA_UNIT_ID || "2ee9478c-11a1-4cd9-8b13-589b299badeb";
const OUT = path.resolve(__dirname, "../../docs/qa-mobile-390");
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

async function overflowX(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
    const clientW = doc.clientWidth;
    return {
      scrollW,
      clientW,
      overflow: scrollW > clientW + 1,
      delta: scrollW - clientW,
    };
  });
}

async function btnMetrics(page, name) {
  const btn = page.getByRole("button", { name }).first();
  if (!(await btn.count())) return null;
  return btn.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      padTop: parseFloat(cs.paddingTop),
      padBottom: parseFloat(cs.paddingBottom),
      padLeft: parseFloat(cs.paddingLeft),
      padRight: parseFloat(cs.paddingRight),
      w: r.width,
      h: r.height,
    };
  });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: /^Email$/i }).click();
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/properties|onboarding/, { timeout: 25000 });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await login(page);
  note("auth", "pass", `Signed in → ${page.url()}`);

  // --- Properties ---
  await page.goto(`${BASE}/properties`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "01-properties-390");
  const propsText = await page.locator("main, .shell-content").innerText();
  const ovProps = await overflowX(page);
  note(
    "properties-overflow",
    ovProps.overflow ? "fail" : "pass",
    ovProps.overflow
      ? `Horizontal overflow +${ovProps.delta}px`
      : "No page horizontal overflow",
  );
  note(
    "properties-zero-unit",
    /No units yet|NO UNIT|Add unit/i.test(propsText) ? "pass" : "fail",
    /No units yet|NO UNIT|Add unit/i.test(propsText)
      ? "Zero-unit row / Add unit visible"
      : "Zero-unit affordance missing",
  );

  // --- Money-in feed (/payments) ---
  await page.goto(`${BASE}/payments`, { waitUntil: "networkidle" });
  await page
    .waitForFunction(
      () =>
        /Money in|No money in|Download receipt|Couldn’t load|Could not load/i.test(
          document.body.innerText,
        ),
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "02-money-in-feed-390");
  const feedText = await page.locator("main, .shell-content").innerText();
  const ovFeed = await overflowX(page);
  note(
    "money-in-overflow",
    ovFeed.overflow ? "fail" : "pass",
    ovFeed.overflow
      ? `Horizontal overflow +${ovFeed.delta}px`
      : "No page horizontal overflow",
  );

  const feedLoaded =
    /Download receipt|No money in yet|Couldn’t load money in|Could not load/i.test(
      feedText,
    ) || (await page.locator('a[href*="/payments/"]').count()) > 0;
  note(
    "money-in-load",
    feedLoaded ? "pass" : "fail",
    feedLoaded
      ? /No money in yet/i.test(feedText)
        ? "Empty money-in state rendered"
        : "Money-in feed settled"
      : `Unexpected feed: ${feedText.slice(0, 160)}`,
  );

  // Table should scroll inside wrap, not expand page
  const tableScroll = await page.evaluate(() => {
    const wrap = document.querySelector(".data-table-wrap");
    if (!wrap) return { hasWrap: false };
    const cs = getComputedStyle(wrap);
    return {
      hasWrap: true,
      overflowX: cs.overflowX,
      scrollWidth: wrap.scrollWidth,
      clientWidth: wrap.clientWidth,
    };
  });
  if (tableScroll.hasWrap) {
    const scrollsInside =
      tableScroll.overflowX === "auto" ||
      tableScroll.overflowX === "scroll" ||
      tableScroll.scrollWidth <= tableScroll.clientWidth + 1;
    note(
      "money-in-table-scroll",
      scrollsInside || !ovFeed.overflow ? "pass" : "fail",
      `wrap overflow-x=${tableScroll.overflowX} scroll=${tableScroll.scrollWidth}/${tableScroll.clientWidth}`,
    );
  } else if (/No money in yet/i.test(feedText)) {
    note("money-in-table-scroll", "pass", "Empty state — no table wrap");
  } else {
    note("money-in-table-scroll", "partial", "No .data-table-wrap found");
  }

  let unitUrl = `${BASE}/payments/${UNIT}`;
  const unitFromFeed = page.locator('a[href*="/payments/"]').first();
  if (await unitFromFeed.count()) {
    unitUrl = new URL(
      (await unitFromFeed.getAttribute("href")) || unitUrl,
      BASE,
    ).toString();
  }

  // --- Unit payments ---
  await page.goto(unitUrl, { waitUntil: "networkidle" });
  await page
    .waitForFunction(
      () =>
        /Record Manual Payment|Retry|Could not load|Couldn’t load/i.test(
          document.body.innerText,
        ),
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "03-unit-payments-390");
  const payText = await page.locator("main, .shell-content").innerText();
  const ovPay = await overflowX(page);
  note(
    "payments-overflow",
    ovPay.overflow ? "fail" : "pass",
    ovPay.overflow
      ? `Horizontal overflow +${ovPay.delta}px`
      : "No page horizontal overflow",
  );

  if (
    /Could not load|Couldn’t load|Retry/i.test(payText) &&
    !/Record Manual Payment/i.test(payText)
  ) {
    note("payments-load", "pass", "FetchErrorState path visible");
  } else if (/Record Manual Payment/i.test(payText)) {
    note("payments-load", "pass", "Unit payments settled with CTAs");
  } else {
    note("payments-load", "fail", `Unexpected: ${payText.slice(0, 160)}`);
  }

  const manualMetrics = await btnMetrics(page, /Record Manual Payment/i);
  const paystackMetrics = await btnMetrics(page, /Pay with Paystack/i);
  for (const [label, m] of [
    ["manual-cta", manualMetrics],
    ["paystack-cta", paystackMetrics],
  ]) {
    if (!m) {
      note(label, "fail", "Button not found");
      continue;
    }
    const okPad =
      m.padTop >= 10 &&
      m.padBottom >= 10 &&
      m.padLeft >= 12 &&
      m.padRight >= 12;
    const okTouch = m.h >= 40;
    note(
      label,
      okPad && okTouch ? "pass" : "fail",
      `pad=${m.padTop}/${m.padRight}/${m.padBottom}/${m.padLeft} size=${Math.round(m.w)}x${Math.round(m.h)}`,
    );
  }

  if (manualMetrics) {
    await page.getByRole("button", { name: /Record Manual Payment/i }).click();
    await page.waitForTimeout(400);
    await shot(page, "04-manual-form-390");
    const formVisible =
      (await page.locator("text=Bank / cash reference").count()) > 0 ||
      (await page.getByRole("button", { name: /Save payment/i }).count()) > 0;
    const amount = page
      .locator(".manual-payment-card input, form input")
      .first();
    let usable = false;
    if (await amount.count()) {
      await amount.fill("2000");
      usable = (await amount.inputValue()) === "2000";
    }
    const ovForm = await overflowX(page);
    note(
      "manual-form",
      formVisible && usable && !ovForm.overflow ? "pass" : "fail",
      `visible=${formVisible} fill=${usable} overflow=${ovForm.overflow}`,
    );
    const cancel = page.getByRole("button", { name: /Cancel/i });
    if (await cancel.count()) await cancel.click();
  }

  // --- Unit reminders ---
  const remUrl = unitUrl.replace("/payments/", "/reminders/");
  await page.goto(remUrl, { waitUntil: "networkidle" });
  await page
    .waitForFunction(
      () =>
        /Retry|Send Reminder|No reminders|Could not load|Couldn’t load/i.test(
          document.body.innerText,
        ),
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "05-unit-reminders-390");
  const remText = await page.locator("main, .shell-content").innerText();
  const ovRem = await overflowX(page);
  note(
    "reminders-overflow",
    ovRem.overflow ? "fail" : "pass",
    ovRem.overflow
      ? `Horizontal overflow +${ovRem.delta}px`
      : "No page horizontal overflow",
  );
  if (/Retry/i.test(remText) && /failed|QA seeded|SMTP|error/i.test(remText)) {
    note("reminders-retry", "pass", "Failed row + Retry visible");
  } else if (/Send Reminder|No reminders/i.test(remText)) {
    note(
      "reminders-retry",
      "partial",
      "Reminders UI loaded; no failed Retry row",
    );
  } else {
    note("reminders-retry", "fail", `Unexpected: ${remText.slice(0, 160)}`);
  }

  const retryBtn = page.getByRole("button", { name: /Retry/i }).first();
  if (await retryBtn.count()) {
    const retryMetrics = await retryBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        padTop: parseFloat(cs.paddingTop),
        padBottom: parseFloat(cs.paddingBottom),
        w: r.width,
        h: r.height,
      };
    });
    const ok =
      retryMetrics.padTop >= 8 &&
      retryMetrics.h >= 32 &&
      retryMetrics.w >= 44;
    note(
      "retry-cta",
      ok ? "pass" : "fail",
      `padY≈${retryMetrics.padTop}+${retryMetrics.padBottom} size=${Math.round(retryMetrics.w)}x${Math.round(retryMetrics.h)}`,
    );
  } else {
    note("retry-cta", "partial", "No Retry button to measure");
  }

  const summary = {
    base: BASE,
    viewport: "390x844",
    at: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(
    path.join(OUT, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log("\nWrote", path.join(OUT, "summary.json"));
  await browser.close();
  if (results.some((r) => r.status === "fail")) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
