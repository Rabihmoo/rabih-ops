// One-off: screenshots the dev server at :5173 for a token-baseline review.
// Not part of the test suite. Run via:
//   npx tsx scripts/screenshot.mts
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const adminState = JSON.parse(
  fs.readFileSync('tests/fixtures/.auth/admin.json', 'utf8'),
);
const entry = adminState.origins?.[0]?.localStorage?.[0];
if (!entry) {
  throw new Error('admin.json has no localStorage entries — run setup first');
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(
  ([k, v]: [string, string]) => {
    localStorage.setItem(k, v);
  },
  [entry.name, entry.value] as [string, string],
);

const page = await ctx.newPage();

// Login page — unauth route, exercises bg/primary/card/input tokens.
await page.goto('http://localhost:5173/login');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'baseline-login.png' });

// Dashboard — authed, shows tiles, badges, sidebar, top bar.
await page.goto('http://localhost:5173/');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'baseline-dashboard.png', fullPage: true });

// Tasks list — shows list rows, badges, filter bar.
await page.goto('http://localhost:5173/tasks');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(800);
await page.screenshot({ path: 'baseline-tasks.png', fullPage: true });

await browser.close();
console.log('Wrote baseline-login.png, baseline-dashboard.png, baseline-tasks.png');
