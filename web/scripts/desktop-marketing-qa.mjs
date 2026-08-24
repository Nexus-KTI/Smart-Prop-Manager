import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "docs", "marketing-qa");
const base = process.env.MARKETING_URL || "http://127.0.0.1:3000";
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

const issues = [];
await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(400);

const report = await page.evaluate(() => {
  const TOKEN_RE =
    /var\(--(?:accent|surface|border|ink|muted|background|background-alt|alert|font-[^)]+|marketing-[^)]+)\)|transparent|inherit|currentColor|none|0px|#fff|#ffffff|#000|#000000/i;

  function parseColor(c) {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return c;
    return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
  }

  const sections = [
    ...document.querySelectorAll(
      ".marketing-top, .marketing-section, .marketing-footer",
    ),
  ].map((el) => {
    const container = el.querySelector(".marketing-container");
    const cr = container?.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const bg = getComputedStyle(el).backgroundColor;
    return {
      tag: el.tagName.toLowerCase(),
      cls: el.className,
      top: Math.round(er.top + window.scrollY),
      height: Math.round(er.height),
      bg: parseColor(bg),
      containerLeft: cr ? Math.round(cr.left) : null,
      containerWidth: cr ? Math.round(cr.width) : null,
      containerRight: cr ? Math.round(cr.right) : null,
      hasContainer: Boolean(container),
      textOutsideContainer: (() => {
        if (!container) return true;
        const cbox = container.getBoundingClientRect();
        const texts = el.querySelectorAll(
          "h1,h2,h3,p,a,li,button,span,label",
        );
        for (const t of texts) {
          if (!container.contains(t)) {
            const r = t.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            // text node belonging to section but outside container
            if (r.left < cbox.left - 1 || r.right > cbox.right + 1) {
              return {
                tag: t.tagName,
                text: (t.textContent || "").trim().slice(0, 40),
                left: Math.round(r.left),
                right: Math.round(r.right),
              };
            }
          }
        }
        // any direct text children of section outside container?
        for (const child of el.children) {
          if (child === container) continue;
          if (child.matches(".marketing-container")) continue;
          const r = child.getBoundingClientRect();
          if (r.width > 2 && child.textContent?.trim()) {
            return {
              tag: child.tagName,
              text: child.textContent.trim().slice(0, 40),
              note: "sibling of container",
            };
          }
        }
        return null;
      })(),
    };
  });

  // Sample computed colors on key marketing nodes
  const sampleSelectors = [
    ".marketing",
    ".marketing-top",
    ".marketing-logo",
    ".marketing-nav",
    ".marketing-brand",
    ".marketing-title",
    ".marketing-lede",
    ".marketing-h2",
    ".marketing-h3",
    ".marketing-list-item",
    ".marketing-card-icon",
    ".marketing-step-num",
    ".marketing-preview",
    ".marketing-faq-q",
    ".marketing-footer-brand",
    ".marketing-footer-link",
    ".marketing-footer-copy",
    ".btn-primary",
    ".btn-secondary",
    ".btn-outline",
  ];

  const colors = sampleSelectors.map((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const cs = getComputedStyle(el);
    return {
      sel,
      color: parseColor(cs.color),
      backgroundColor: parseColor(cs.backgroundColor),
      borderColor: parseColor(cs.borderColor),
    };
  });

  // Resolve CSS token values from :root
  const root = getComputedStyle(document.documentElement);
  const tokens = {
    background: parseColor(root.getPropertyValue("--background").trim() || getComputedStyle(document.body).backgroundColor),
    backgroundAlt: root.getPropertyValue("--background-alt").trim(),
    surface: root.getPropertyValue("--surface").trim(),
    border: root.getPropertyValue("--border").trim(),
    ink: root.getPropertyValue("--ink").trim(),
    accent: root.getPropertyValue("--accent").trim(),
    muted: root.getPropertyValue("--muted").trim(),
  };

  function hexToRgb(hex) {
    const h = hex.replace("#", "").trim();
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      return `rgb(${r}, ${g}, ${b})`;
    }
    if (h.length === 6) {
      return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
    }
    return hex;
  }

  const tokenRgbs = Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [
      k,
      v.startsWith("#") ? hexToRgb(v) : v.startsWith("rgb") ? v : v,
    ]),
  );

  return {
    viewport: { w: window.innerWidth, scrollW: document.documentElement.scrollWidth },
    sections,
    colors,
    tokenRgbs,
    footerBorder: getComputedStyle(document.querySelector(".marketing-footer"))
      .borderTopWidth,
  };
});

// Validate containers
const widths = report.sections
  .filter((s) => s.containerWidth != null)
  .map((s) => s.containerWidth);
const uniqueWidths = [...new Set(widths)];
if (uniqueWidths.length > 1) {
  issues.push(`Inconsistent container widths: ${uniqueWidths.join(", ")}`);
}
if (widths.some((w) => w !== 720)) {
  issues.push(`Expected container width 720 at desktop, got ${uniqueWidths.join(", ")}`);
}

for (const s of report.sections) {
  if (!s.hasContainer) issues.push(`Missing .marketing-container on ${s.cls}`);
  if (s.textOutsideContainer) {
    issues.push(
      `Text outside container in ${s.cls}: ${JSON.stringify(s.textOutsideContainer)}`,
    );
  }
}

// Alternating backgrounds: section bands after header
const bands = report.sections.filter((s) =>
  String(s.cls).includes("marketing-section") ||
  String(s.cls).includes("marketing-footer"),
);
const alt = report.tokenRgbs.backgroundAlt.startsWith("#")
  ? report.tokenRgbs.backgroundAlt
  : report.tokenRgbs.backgroundAlt;
// normalize token rgb
function toRgb(v) {
  if (v.startsWith("rgb")) return v.replace(/\s+/g, "");
  if (v.startsWith("#")) {
    const h = v.slice(1);
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return `rgb(${parseInt(full.slice(0, 2), 16)},${parseInt(full.slice(2, 4), 16)},${parseInt(full.slice(4, 6), 16)})`;
  }
  return v.replace(/\s+/g, "");
}
const bg = toRgb(report.tokenRgbs.background);
const bgAlt = toRgb(report.tokenRgbs.backgroundAlt || report.tokenRgbs.background);

const sectionBands = report.sections.filter((s) =>
  /\bmarketing-section\b/.test(s.cls),
);
const expectedAlt = [false, true, false, true, false, true]; // hero, problem, how, preview, faq, cta
sectionBands.forEach((s, i) => {
  const got = toRgb(s.bg);
  const wantAlt = expectedAlt[i];
  const want = wantAlt ? bgAlt : bg;
  if (got !== want) {
    issues.push(
      `Section ${i} (${s.cls.slice(0, 60)}) bg ${got} expected ${want} (alt=${wantAlt})`,
    );
  }
});

if (report.footerBorder === "0px") {
  issues.push("Footer missing top border separation");
}

await page.screenshot({
  path: path.join(outDir, "marketing-1440-full.png"),
  fullPage: true,
});

console.log(
  JSON.stringify(
    {
      issues,
      containerWidths: uniqueWidths,
      sectionBgs: sectionBands.map((s, i) => ({
        i,
        cls: s.cls,
        bg: s.bg,
      })),
      footerBorder: report.footerBorder,
      scrollW: report.viewport.scrollW,
    },
    null,
    2,
  ),
);

await browser.close();
process.exit(issues.length ? 1 : 0);
