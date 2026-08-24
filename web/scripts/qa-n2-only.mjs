import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3003";
const UNIT = "2ee9478c-11a1-4cd9-8b13-589b299badeb";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: /email/i }).click();
await page.locator('input[type="email"]').fill("smoke.e2e@smartprop.local");
await page.locator('input[type="password"]').fill("QaSmokePass!2026");
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL(/properties/, { timeout: 20000 });

await page.goto(`${BASE}/payments/${UNIT}`, { waitUntil: "networkidle" });
await page.waitForFunction(
  () => /Record Manual Payment/i.test(document.body.innerText),
  { timeout: 20000 },
);
await page.getByRole("button", { name: /Record Manual Payment/i }).click();
await page.waitForTimeout(400);

const amount = page.locator(".manual-payment-form input, form input").first();
await amount.fill("1500");
const ref = page.locator('input[placeholder*="Optional"]').first();
if (await ref.count()) await ref.fill(`qa-n2-${Date.now()}`);

await page.getByRole("button", { name: /Save payment/i }).click();
await page.waitForFunction(
  () => {
    const text = document.body.innerText;
    return (
      /Record Manual Payment/i.test(text) &&
      !/Bank \/ cash reference/i.test(text)
    );
  },
  { timeout: 20000 },
).catch(() => {});
await page.waitForTimeout(800);

const text = await page.locator("main").innerText();
const formOpen = (await page.locator("text=Bank / cash reference").count()) > 0;
const has1500 = /1,?500/.test(text);
const manualCta = /Record Manual Payment/i.test(text);
const result = { has1500, formOpen, manualCta, hasDownload: /Download receipt/i.test(text) };
console.log(JSON.stringify(result));
await page.screenshot({
  path: "scripts/qa-now-screenshots/08b-n2-after-save.png",
  fullPage: true,
});
await browser.close();
process.exit(manualCta && !formOpen ? 0 : 1);
