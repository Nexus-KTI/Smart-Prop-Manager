// Renders app/opengraph-image.png (1200x630) — the link preview for WhatsApp, X, LinkedIn.
// The mark path is read from public/brand/mark.svg; rerun after a mark or tagline change:
//   node scripts/render-og-image.mjs   (from web/, needs network for Geist)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const markSvg = fs.readFileSync(path.join(web, "public", "brand", "mark.svg"), "utf8");
const d = markSvg.match(/\sd="([^"]+)"/)?.[1];
if (!d) throw new Error("No path d in public/brand/mark.svg");

const brandTs = fs.readFileSync(path.join(web, "lib", "brand.ts"), "utf8");
const tagline = brandTs.match(/BRAND_TAGLINE = "([^"]+)"/)?.[1];
if (!tagline) throw new Error("No BRAND_TAGLINE in lib/brand.ts");

// Light-theme token values from app/globals.css.
const t = {
  background: "#f7f8f7",
  surface: "#ffffff",
  border: "#e2e4e1",
  ink: "#14171a",
  accent: "#0f6e4f",
  brand: "#e65100",
  alert: "#b4402a",
  muted: "#6b7280",
};

const rows = [
  { unit: "Flat 1A", amount: "₦650,000", state: "Paid", color: t.accent },
  { unit: "Flat 2B", amount: "₦450,000", state: "Owes", color: t.alert },
  { unit: "Shop 3", amount: "₦300,000", state: "Due 5 Oct", color: t.muted },
];

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=JetBrains+Mono:wght@500;600&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: ${t.background}; color: ${t.ink};
    font-family: Geist, sans-serif; display: flex; align-items: center; padding: 0 88px; gap: 72px; }
  .copy { flex: 1; display: flex; flex-direction: column; gap: 36px; }
  .lockup { display: flex; align-items: center; gap: 6px; color: ${t.accent}; }
  .name { font-size: 64px; font-weight: 650; letter-spacing: -0.02em; line-height: 1; }
  .stamp { display: inline-flex; align-items: center; gap: 0.3em; margin-left: 18px; padding-left: 18px;
    border-left: 2px solid ${t.border}; color: ${t.muted}; font-size: 22px; font-weight: 500; }
  .stamp b { background: ${t.brand}; color: ${t.surface}; font-weight: 700; letter-spacing: .04em;
    padding: .12em .36em .08em; border-radius: 4px; }
  h1 { font-size: 58px; font-weight: 650; letter-spacing: -0.03em; line-height: 1.05; }
  p { font-size: 26px; color: ${t.muted}; line-height: 1.35; }
  .ledger { width: 380px; background: ${t.surface}; border: 1px solid ${t.border}; border-radius: 12px; }
  .row { display: flex; align-items: center; justify-content: space-between; padding: 26px 28px;
    border-top: 1px solid ${t.border}; font-size: 22px; }
  .row:first-child { border-top: 0; }
  .unit { font-weight: 600; }
  .mono { font-family: "JetBrains Mono", monospace; font-weight: 500; }
  .amount { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .state { font-size: 17px; font-weight: 600; }
</style></head><body>
  <div class="copy">
    <div class="lockup">
      <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd" d="${d}"/>
      </svg>
      <span class="name">nexora</span>
      <span class="stamp">by <b>KTI</b></span>
    </div>
    <h1>${tagline}</h1>
    <p>Rent and chase for Nigerian landlords.<br>Cash, transfer, Paystack, WhatsApp.</p>
  </div>
  <div class="ledger">
    ${rows
      .map(
        (r) => `<div class="row"><span class="unit">${r.unit}</span>
      <span class="amount"><span class="mono">${r.amount}</span>
      <span class="state" style="color:${r.color}">${r.state}</span></span></div>`,
      )
      .join("")}
  </div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
const fontsLoaded = await page.evaluate(async () => {
  await document.fonts.ready;
  return document.fonts.check('650 64px "Geist"') && document.fonts.check('500 22px "JetBrains Mono"');
});
if (!fontsLoaded) throw new Error("Geist / JetBrains Mono did not load; check network");
const out = path.join(web, "app", "opengraph-image.png");
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${path.relative(web, out)}`);
