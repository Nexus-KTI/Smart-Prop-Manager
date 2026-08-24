import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "docs", "marketing-qa");
const base = process.env.MARKETING_URL || "http://127.0.0.1:3000";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const issues = [];

await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 });

// Horizontal overflow check
const overflow = await page.evaluate(() => {
  const doc = document.documentElement;
  const body = document.body;
  const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
  const clientW = doc.clientWidth;
  const offenders = [];
  if (scrollW > clientW + 1) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.right > clientW + 1 || r.left < -1) {
        const tag = el.tagName.toLowerCase();
        const cls = (el.className && String(el.className).slice(0, 80)) || "";
        offenders.push({
          tag,
          cls,
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
        if (offenders.length >= 12) break;
      }
    }
  }
  return { scrollW, clientW, overflow: scrollW > clientW + 1, offenders };
});

if (overflow.overflow) {
  issues.push(`Horizontal overflow: scrollWidth=${overflow.scrollW} > clientWidth=${overflow.clientW}`);
  for (const o of overflow.offenders) {
    issues.push(`  - <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} w=${o.width}`);
  }
}

// Layout checks
const layout = await page.evaluate(() => {
  const heroPreview = document.querySelector(".marketing-hero-preview");
  const cards = [...document.querySelectorAll(".marketing-list-item, .marketing-step")];
  const footer = document.querySelector(".marketing-footer-inner");
  const faq = document.querySelector(".marketing-faq");

  const heroBox = heroPreview?.getBoundingClientRect();
  const footerStyles = footer ? getComputedStyle(footer) : null;

  return {
    heroPreviewWidth: heroBox ? Math.round(heroBox.width) : null,
    heroPreviewOverflows:
      heroBox != null ? heroBox.right > window.innerWidth + 1 : null,
    cardCount: cards.length,
    cardWidths: cards.map((c) => Math.round(c.getBoundingClientRect().width)),
    footerDirection: footerStyles?.flexDirection ?? null,
    faqExists: Boolean(faq),
    faqItemCount: document.querySelectorAll(".marketing-faq-item").length,
  };
});

const maxCard = Math.max(...(layout.cardWidths.length ? layout.cardWidths : [0]));
if (maxCard > 390) {
  issues.push(`Card wider than viewport: ${maxCard}px`);
}
if (layout.footerDirection !== "column") {
  issues.push(`Footer flexDirection expected column at 390px, got ${layout.footerDirection}`);
}
if (layout.heroPreviewOverflows) {
  issues.push("Hero preview overflows viewport horizontally");
}

// FAQ accordion: open a closed item (first is open by default)
const faqTrigger = page.locator(".marketing-faq-trigger").nth(1);
if ((await page.locator(".marketing-faq-trigger").count()) === 0) {
  issues.push("No FAQ accordion triggers found");
} else {
  const beforeExpanded = await faqTrigger.getAttribute("aria-expanded");
  await faqTrigger.click();
  await page.waitForTimeout(200);
  const afterExpanded = await faqTrigger.getAttribute("aria-expanded");
  const panelVisible = await page
    .locator(".marketing-faq-item")
    .nth(1)
    .locator(".marketing-faq-a")
    .isVisible()
    .catch(() => false);

  if (afterExpanded !== "true" && !panelVisible) {
    issues.push(
      `FAQ accordion did not open (aria-expanded before=${beforeExpanded} after=${afterExpanded}, panelVisible=${panelVisible})`,
    );
  }
}

await page.screenshot({
  path: path.join(outDir, "marketing-390-full.png"),
  fullPage: true,
});

await page.screenshot({
  path: path.join(outDir, "marketing-390-hero.png"),
  fullPage: false,
});

// Scroll to footer and capture
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(150);
await page.screenshot({
  path: path.join(outDir, "marketing-390-footer.png"),
  fullPage: false,
});

console.log(JSON.stringify({ layout, overflow, issues }, null, 2));
await browser.close();
process.exit(issues.length ? 1 : 0);
