// Capture /design-preview in both dark and light modes.
//
// Run via:
//   npm run dev                          # in another terminal
//   npx tsx scripts/design-preview-screenshot.mts
//
// Output:
//   screenshots/design-preview-dark.png
//   screenshots/design-preview-light.png
//
// The page itself ships an in-page theme toggle, but we drive the
// theme directly via documentElement.classList so the screenshots are
// deterministic regardless of UI state.

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:5173';
const OUT_DIR = 'screenshots';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const adminState = JSON.parse(
  fs.readFileSync('tests/fixtures/.auth/admin.json', 'utf8'),
);
const entry = adminState.origins?.[0]?.localStorage?.[0];
if (!entry) {
  throw new Error('admin.json has no localStorage entries — run setup first');
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 2400 },
  deviceScaleFactor: 2,
});
await ctx.addInitScript(
  ([k, v]: [string, string]) => {
    localStorage.setItem(k, v);
  },
  [entry.name, entry.value] as [string, string],
);

const page = await ctx.newPage();

async function shot(theme: 'dark' | 'light') {
  await page.goto(BASE + '/design-preview', { waitUntil: 'networkidle' });
  // Wait for the React tree + sticky header to settle.
  await page.waitForSelector('[data-testid="design-preview-theme-dark"]', { timeout: 5000 });
  // Force the theme via the html class so screenshots are deterministic.
  await page.evaluate((t) => {
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, theme);
  // Give CSS a beat to re-apply tokens.
  await page.waitForTimeout(400);
  const out = path.join(OUT_DIR, `design-preview-${theme}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`✓ ${out}`);
}

await shot('dark');
await shot('light');

await browser.close();
