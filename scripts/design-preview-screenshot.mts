// Capture /design-preview across the matrix Phase 3 needs:
//   - design-preview (full page, dark + light) — the original Phase 2 output
//   - shell-desktop (chrome + top-of-page, dark + light)
//   - shell-mobile  (chrome + top-of-page, dark + light)
//   - shell-drawer  (mobile, drawer open, dark + light)
//
// Run via:
//   npm run dev                          # in another terminal
//   npx tsx scripts/design-preview-screenshot.mts
//
// Outputs land in screenshots/ (gitignored).
//
// The page itself ships a dev theme toggle, but we drive the html.dark
// class directly so the captures are deterministic regardless of UI
// state and so the drawer-trigger run can skip the toggle interaction.

import { chromium, type BrowserContext, type Page } from '@playwright/test';
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

type Viewport = { width: number; height: number };

async function makeContext(viewport: Viewport): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(
    ([k, v]: [string, string]) => {
      localStorage.setItem(k, v);
    },
    [entry.name, entry.value] as [string, string],
  );
  return ctx;
}

async function applyTheme(page: Page, theme: 'dark' | 'light') {
  await page.evaluate((t) => {
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, theme);
  // Give CSS a beat to re-apply tokens.
  await page.waitForTimeout(400);
}

async function gotoPreview(page: Page) {
  await page.goto(BASE + '/design-preview', { waitUntil: 'networkidle' });
  // Wait for the React tree + sticky header to settle.
  await page.waitForSelector('[data-testid="design-preview-theme-dark"]', {
    timeout: 5000,
  });
}

const browser = await chromium.launch();

// -------------------------------------------------------------------
// 1. Original full-page preview captures (Phase 2 compatibility).
// AppLayout uses an inner scrollable container, so the viewport must
// be tall enough for `fullPage: true` to grab the whole preview.
// -------------------------------------------------------------------
{
  const ctx = await makeContext({ width: 1440, height: 4800 });
  const page = await ctx.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await gotoPreview(page);
    await applyTheme(page, theme);
    const out = path.join(OUT_DIR, `design-preview-${theme}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`✓ ${out}`);
  }
  await ctx.close();
}

// -------------------------------------------------------------------
// 2. Desktop shell — viewport-sized only (no fullPage) so the capture
// shows the chrome + top of the preview instead of the entire scroll.
// -------------------------------------------------------------------
{
  const ctx = await makeContext({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await gotoPreview(page);
    await applyTheme(page, theme);
    const out = path.join(OUT_DIR, `shell-desktop-${theme}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
  }
  await ctx.close();
}

// -------------------------------------------------------------------
// 3. Mobile shell — closed drawer.
// -------------------------------------------------------------------
{
  const ctx = await makeContext({ width: 390, height: 844 });
  const page = await ctx.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await gotoPreview(page);
    await applyTheme(page, theme);
    const out = path.join(OUT_DIR, `shell-mobile-${theme}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
  }
  await ctx.close();
}

// -------------------------------------------------------------------
// 4. Mobile shell — drawer open. Click the "More" slot, wait for the
// translate animation (200ms) plus a small buffer for backdrop fade.
// -------------------------------------------------------------------
{
  const ctx = await makeContext({ width: 390, height: 844 });
  const page = await ctx.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await gotoPreview(page);
    await applyTheme(page, theme);
    await page.locator('[data-testid="mobile-drawer-trigger"]').click();
    // Drawer transition is 200ms; wait a bit longer so opacity/blur
    // backdrop also settles before we shoot.
    await page.waitForSelector('[data-testid="mobile-drawer"][data-state="open"]');
    await page.waitForTimeout(350);
    const out = path.join(OUT_DIR, `shell-drawer-${theme}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
  }
  await ctx.close();
}

// -------------------------------------------------------------------
// 5. Phase 4.1 page captures — Dashboard + Activity Inbox.
// Goto the live route, wait for known DOM to settle, then shoot at
// each viewport × theme. We use `domcontentloaded` instead of
// `networkidle` because TanStack Query keeps a few connections warm
// for refetch — networkidle never settles on these pages.
// -------------------------------------------------------------------
async function gotoRoute(page: Page, route: string, settleSelector: string) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(settleSelector, { timeout: 8000 });
  // Give the data hooks one frame to populate.
  await page.waitForTimeout(800);
}

interface PageCapture {
  slug: string;
  route: string;
  settle: string;
}

const PHASE_4_PAGES: PageCapture[] = [
  { slug: 'dashboard',     route: '/',              settle: 'h1' },
  { slug: 'inbox',         route: '/inbox',         settle: 'h1' },
  { slug: 'tasks',         route: '/tasks',         settle: 'h1' },
  { slug: 'follow-ups',    route: '/follow-ups',    settle: 'h1' },
  { slug: 'settings',      route: '/settings',      settle: 'h1' },
  { slug: 'directory',     route: '/directory',     settle: 'h1' },
  { slug: 'companies',     route: '/companies',     settle: 'h1' },
  { slug: 'contacts',      route: '/contacts',      settle: 'h1' },
  { slug: 'documents',     route: '/documents',     settle: 'h1' },
  { slug: 'notes',         route: '/notes',         settle: 'h1' },
  { slug: 'purchases',     route: '/purchases',     settle: 'h1' },
  { slug: 'inspections',   route: '/inspections',   settle: 'h1' },
  { slug: 'fixed-tasks',   route: '/fixed-tasks',   settle: 'h1' },
  { slug: 'notifications', route: '/notifications', settle: 'h1' },
];

// Desktop captures.
{
  const ctx = await makeContext({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  for (const p of PHASE_4_PAGES) {
    for (const theme of ['dark', 'light'] as const) {
      await gotoRoute(page, p.route, p.settle);
      await applyTheme(page, theme);
      const out = path.join(OUT_DIR, `${p.slug}-${theme}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`✓ ${out}`);
    }
  }
  await ctx.close();
}

// Mobile captures.
{
  const ctx = await makeContext({ width: 390, height: 844 });
  const page = await ctx.newPage();
  for (const p of PHASE_4_PAGES) {
    for (const theme of ['dark', 'light'] as const) {
      await gotoRoute(page, p.route, p.settle);
      await applyTheme(page, theme);
      const out = path.join(OUT_DIR, `${p.slug}-mobile-${theme}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`✓ ${out}`);
    }
  }
  await ctx.close();
}

// -------------------------------------------------------------------
// 6. Detail-page captures — click the first row in /tasks and
// /follow-ups, then shoot the detail page. Skips gracefully if the
// list is empty (no seeded data).
// -------------------------------------------------------------------
interface DetailCapture {
  slug: string;
  listRoute: string;
  rowSelector: string;
  /** Filter chip text to click before looking for rows. */
  broadFilter: string;
}

const DETAIL_PAGES: DetailCapture[] = [
  // Click the broadest filter so the row selector matches even when the
  // page defaults to an empty bucket. `broadFilter: ''` skips the click
  // for pages that don't have a default filter that excludes rows.
  { slug: 'task-detail',       listRoute: '/tasks',       rowSelector: 'ul li button', broadFilter: 'Active' },
  { slug: 'follow-up-detail',  listRoute: '/follow-ups',  rowSelector: 'ul li button', broadFilter: 'All'    },
  // Scope row selectors to `main` so the sidebar NavLinks don't get
  // matched first when a page uses <Link> (anchor) for its rows.
  { slug: 'document-detail',   listRoute: '/documents',   rowSelector: 'main ul li a',      broadFilter: ''       },
  { slug: 'note-detail',       listRoute: '/notes',       rowSelector: 'main ul li a',      broadFilter: ''       },
  { slug: 'purchase-detail',   listRoute: '/purchases',   rowSelector: 'main ul li button', broadFilter: 'All'    },
  { slug: 'inspection-detail', listRoute: '/inspections', rowSelector: 'main ul li button', broadFilter: 'All'    },
  { slug: 'fixed-task-detail', listRoute: '/fixed-tasks', rowSelector: 'main ul li a',      broadFilter: ''       },
];

{
  const ctx = await makeContext({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  for (const d of DETAIL_PAGES) {
    for (const theme of ['dark', 'light'] as const) {
      await gotoRoute(page, d.listRoute, 'h1');
      await applyTheme(page, theme);
      // Switch to the broad bucket so we have something to click. Skip
      // when broadFilter is empty (page has no bucket-group filter).
      if (d.broadFilter) {
        const filter = page.getByRole('tab', { name: d.broadFilter, exact: true }).first();
        await filter.click();
      }
      // Wait for the row list to render after the filter change.
      try {
        await page.waitForSelector(d.rowSelector, { timeout: 5000 });
      } catch {
        console.log(`⚠ ${d.slug}-${theme}: no rows, skipping`);
        continue;
      }
      const row = page.locator(d.rowSelector).first();
      await row.click();
      // Wait for the detail H1 to settle (router push + data load).
      await page.waitForSelector('h1', { timeout: 8000 });
      await page.waitForTimeout(800);
      // Re-apply theme since the route change can re-mount the body.
      await applyTheme(page, theme);
      const out = path.join(OUT_DIR, `${d.slug}-${theme}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`✓ ${out}`);
    }
  }
  await ctx.close();
}

// -------------------------------------------------------------------
// 7. Login captures — unauthenticated. We skip the admin session
// localStorage injection so /login renders instead of redirecting
// to the dashboard. Desktop + mobile × dark + light = 4 captures.
// -------------------------------------------------------------------
async function loginContext(viewport: Viewport): Promise<BrowserContext> {
  return browser.newContext({ viewport, deviceScaleFactor: 2 });
}

{
  const desktop = await loginContext({ width: 1440, height: 900 });
  const dpage = await desktop.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await dpage.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await dpage.waitForSelector('h2, h3, [role="heading"], main', { timeout: 5000 });
    await applyTheme(dpage, theme);
    const out = path.join(OUT_DIR, `login-${theme}.png`);
    await dpage.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
  }
  await desktop.close();

  const mobile = await loginContext({ width: 390, height: 844 });
  const mpage = await mobile.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await mpage.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await mpage.waitForSelector('h2, h3, [role="heading"], main', { timeout: 5000 });
    await applyTheme(mpage, theme);
    const out = path.join(OUT_DIR, `login-mobile-${theme}.png`);
    await mpage.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
  }
  await mobile.close();
}

// -------------------------------------------------------------------
// 8. Command Palette captures — open palette via DesignPreview button,
// type a query to show static fixtures, then capture the palette overlay.
// Desktop + mobile × dark + light = 4 captures.
// -------------------------------------------------------------------
{
  const ctx = await makeContext({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await gotoPreview(page);
    await applyTheme(page, theme);
    // Click the "Open palette" button in the Command Palette section
    await page.getByRole('button', { name: 'Open palette' }).click();
    await page.waitForSelector('[data-testid="command-palette"]', { timeout: 3000 });
    // Type enough chars to trigger the static devResults
    await page.getByTestId('command-palette-input').fill('charcoal');
    await page.waitForTimeout(300);
    const out = path.join(OUT_DIR, `command-palette-${theme}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
    // Close palette before next iteration
    await page.keyboard.press('Escape');
  }
  await ctx.close();
}

{
  const ctx = await makeContext({ width: 390, height: 844 });
  const page = await ctx.newPage();
  for (const theme of ['dark', 'light'] as const) {
    await gotoPreview(page);
    await applyTheme(page, theme);
    await page.getByRole('button', { name: 'Open palette' }).click();
    await page.waitForSelector('[data-testid="command-palette"]', { timeout: 3000 });
    await page.getByTestId('command-palette-input').fill('charcoal');
    await page.waitForTimeout(300);
    const out = path.join(OUT_DIR, `command-palette-mobile-${theme}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
    await page.keyboard.press('Escape');
  }
  await ctx.close();
}

await browser.close();
