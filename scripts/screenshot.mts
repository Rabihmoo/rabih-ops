// One-off: screenshots the local dev server with the seeded admin session.
// Used for visual QA. Reads the URL base from PREVIEW_URL or defaults to
// http://localhost:5173. Run via:
//   PREVIEW_URL=http://localhost:5174 npx tsx scripts/screenshot.mts
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:5173';

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

const shots: { path: string; url: string; pre?: () => Promise<void> }[] = [
  { path: 'baseline-login.png', url: '/login' },
  { path: 'baseline-dashboard.png', url: '/' },
  { path: 'baseline-tasks.png', url: '/tasks' },
  { path: 'baseline-follow-ups.png', url: '/follow-ups' },
  { path: 'baseline-inspections.png', url: '/inspections' },
];

for (const s of shots) {
  await page.goto(BASE + s.url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: s.path, fullPage: true });
}

// Detail screenshots: pick the first task / follow-up / inspection shown.
async function shotFirst(listUrl: string, itemSelector: string, outPath: string) {
  await page.goto(BASE + listUrl);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  const first = page.locator(itemSelector).first();
  if (await first.count()) {
    await first.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: outPath, fullPage: true });
  }
}

await shotFirst('/tasks', 'ul li > button', 'baseline-task-detail.png');
await shotFirst('/follow-ups', 'ul li > button', 'baseline-followup-detail.png');
await shotFirst('/inspections', 'ul li > button', 'baseline-inspection-detail.png');

await browser.close();
console.log('Captured baseline-*.png');
