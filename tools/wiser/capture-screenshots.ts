import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * WISER screenshot evidence (acceptance W8.1).
 *
 * Captures the production build at 1920x1080 and a mobile viewport, for
 * day, golden hour, and night, at overview and street level — twelve
 * images minimum — and writes a manifest binding each file's SHA-256 to
 * the source tree. Reviews cite these files; the goal gate verifies they
 * exist and match the manifest.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'wiser-screenshots');

const TIMES = ['day', 'golden', 'night'] as const;

interface Shot {
  readonly file: string;
  readonly viewport: string;
  readonly timeOfDay: string;
  readonly view: string;
  readonly sha256: string;
}

async function settle(page: Page, ms: number): Promise<void> {
  await page.waitForTimeout(ms);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Close the transient offline-ready toast if it is showing. */
async function dismissToast(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: /Dismiss/i });
  try {
    if (await dismiss.isVisible({ timeout: 500 })) await dismiss.click();
  } catch {
    // No toast on screen; nothing to dismiss.
  }
}

function record(
  shots: Shot[],
  file: string,
  viewport: string,
  timeOfDay: string,
  view: string,
): void {
  shots.push({
    file: file.slice(ROOT.length).replace(/^\//, ''),
    viewport,
    timeOfDay,
    view,
    sha256: sha256(file),
  });
}

async function captureForViewport(
  context: BrowserContext,
  serverUrl: string,
  viewportName: string,
  shots: Shot[],
): Promise<void> {
  for (const time of TIMES) {
    const page = await context.newPage();
    await page.addInitScript((timeOfDay) => {
      localStorage.setItem(
        'qsimcity.settings.v1',
        JSON.stringify({ timeOfDay, quality: 'high', labels: true }),
      );
      localStorage.setItem('qsimcity.progress.v1', JSON.stringify({ onboardingSeen: true }));
    }, time);
    // Run the Bell sample first so the semantic layer is alive in every
    // capture: convoy on the boulevard, district glow, pedestrian density,
    // banners over pylons, containers at the harbor.
    await page.goto(`${serverUrl}/?view=lab&sample=bell`);
    await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('toolbar', { name: 'Replay timeline' }).waitFor({ timeout: 30000 });
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    // Mid-replay moment: the pipeline is visibly working.
    await settle(page, 3500);
    await dismissToast(page);
    await settle(page, 400);

    const overviewFile = join(OUT_DIR, `${viewportName}-${time}-overview.png`);
    await page.screenshot({ path: overviewFile });
    record(shots, overviewFile, viewportName, time, 'overview');

    // Street level: walk mode spawns in the nearest driving lane; a few
    // steps forward stand the camera mid-street.
    await page.keyboard.press('Digit4');
    await settle(page, 600);
    await page.keyboard.down('KeyW');
    await settle(page, 1200);
    await page.keyboard.up('KeyW');
    await settle(page, 700);
    const streetFile = join(OUT_DIR, `${viewportName}-${time}-street.png`);
    await page.screenshot({ path: streetFile });
    record(shots, streetFile, viewportName, time, 'street');
    await page.close();
  }
}

/**
 * Two honesty exhibits beyond the twelve required views: the City Legend
 * open over the city, and the Lab results with their certainty labels.
 */
async function captureHonestyShots(
  context: BrowserContext,
  serverUrl: string,
  shots: Shot[],
): Promise<void> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem(
      'qsimcity.settings.v1',
      JSON.stringify({ timeOfDay: 'day', quality: 'high', labels: true }),
    );
    localStorage.setItem('qsimcity.progress.v1', JSON.stringify({ onboardingSeen: true }));
  });
  await page.goto(`${serverUrl}/?view=lab&sample=bell`);
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Replay timeline' }).waitFor({ timeout: 30000 });
  await settle(page, 2500);
  await dismissToast(page);
  // The exhibit must show actual results with their certainty badges, not
  // the input form (adversarial review finding). The labeled measurement
  // histograms live in Accessible 2D Mode, so capture them there.
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  const results = page.getByRole('region', { name: 'Measurement results' });
  await results.waitFor({ timeout: 15000 });
  await results.scrollIntoViewIfNeeded();
  await settle(page, 600);
  const labFile = join(OUT_DIR, 'desktop-day-lab-results.png');
  await page.screenshot({ path: labFile });
  record(shots, labFile, 'desktop', 'day', 'lab-results');

  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Explore' })
    .click();
  await settle(page, 1200);
  await page.getByRole('button', { name: 'Legend' }).click();
  await page.getByRole('dialog', { name: /City legend/ }).waitFor({ timeout: 10000 });
  const legendFile = join(OUT_DIR, 'desktop-day-legend.png');
  await page.screenshot({ path: legendFile });
  record(shots, legendFile, 'desktop', 'day', 'legend');

  // Inside the Assignment Hall trading floor: a visitor standing just past
  // the doorway, seeing the furnished room and the Layout Desk console.
  await page.getByRole('button', { name: 'Close legend' }).click();
  await settle(page, 400);
  await page.evaluate('window.__qsimcityWalkTo && window.__qsimcityWalkTo(-78.5, 79.2, 0.55)');
  await settle(page, 900);
  const interiorFile = join(OUT_DIR, 'desktop-day-interior.png');
  await page.screenshot({ path: interiorFile });
  record(shots, interiorFile, 'desktop', 'day', 'interior');
  await page.close();
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}`;
  const browser = await chromium.launch({
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const shots: Shot[] = [];
  try {
    const desktop = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      bypassCSP: true,
    });
    await captureForViewport(desktop, baseUrl, 'desktop', shots);
    await captureHonestyShots(desktop, baseUrl, shots);
    await desktop.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      bypassCSP: true,
    });
    await captureForViewport(mobile, baseUrl, 'mobile', shots);
    await mobile.close();
  } finally {
    await browser.close();
    server.close();
  }

  const passed = shots.length >= 12;
  writeFileSync(join(OUT_DIR, 'shots.json'), JSON.stringify(shots, null, 2));
  writeEvidence(join(OUT_DIR, 'manifest.json'), {
    tool: 'wiser-screenshots',
    toolVersion: '1.0.0',
    command: 'pnpm wiser:screens',
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(TIMES.join(',')),
    thresholds: { minImages: 12 },
    measurements: {
      imageCount: shots.length,
      desktopImages: shots.filter((s) => s.viewport === 'desktop').length,
      mobileImages: shots.filter((s) => s.viewport === 'mobile').length,
      timesOfDay: TIMES.length,
    },
    passed,
    detail: { shots },
  });
  console.log(`Captured ${shots.length} screenshots into ${OUT_DIR}`);
  if (!passed) process.exit(1);
}

await main();
