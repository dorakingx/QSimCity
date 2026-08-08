import { chromium, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';
import { sourceTreeHash } from '../evidence.js';

/**
 * The README's own images, captured from the production build.
 *
 * Separate from `tools/wiser/capture-screenshots.ts` on purpose. That tool
 * produces evidence: fifteen images at full resolution, sized for review
 * rather than for a page a stranger scrolls. These are for the landing
 * page, so they are framed, sized and budgeted for reading — and there are
 * eight of them, not fifteen.
 *
 * Every shot goes through the deterministic-frame contract rather than a
 * sleep: the scene is frozen at a fixed `animTime`, transient status
 * messages are suppressed, and exactly one frame is drawn on request. Two
 * runs of the same tree produce the same bytes, so these files change only
 * when the product does.
 *
 * The previous README pointed at three Playwright baselines that a project
 * rename had moved, and showed three broken images on a public landing page
 * for months. Owning the images here, with `pnpm docs:check` verifying that
 * each one exists and is within budget, is the fix for that class of bug.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'docs', 'assets', 'readme');

/** 16:9 for every desktop shot, so the page does not jump between images. */
const DESKTOP = { width: 1280, height: 720 } as const;
/** One phone shot, at the device's own ratio. */
const MOBILE = { width: 390, height: 844 } as const;

interface Shot {
  readonly file: string;
  readonly alt: string;
  readonly bytes: number;
  readonly sha256: string;
}

type TimeOfDay = 'day' | 'golden' | 'night';

/** Seeds a returning visitor: onboarding done, chosen time of day, hooks on. */
async function seed(page: Page, timeOfDay: TimeOfDay, onboardingSeen = true): Promise<void> {
  await page.addInitScript(
    ({ time, seen }) => {
      (window as unknown as Record<string, unknown>)['__QSIMCITY_E2E'] = true;
      localStorage.setItem(
        'qsimcity.settings.v1',
        JSON.stringify({ timeOfDay: time, quality: 'high', labels: true }),
      );
      if (seen) {
        localStorage.setItem('qsimcity.progress.v1', JSON.stringify({ onboardingSeen: true }));
      }
    },
    { time: timeOfDay, seen: onboardingSeen },
  );
}

/**
 * Hooks are driven as functions, never as strings.
 *
 * The production server sends the real Content-Security-Policy, and
 * `script-src 'self'` forbids `unsafe-eval` — so Playwright's string form
 * of `evaluate`, which the e2e helpers use happily against `vite preview`,
 * is refused here. The function form goes through `Runtime.callFunctionOn`
 * and is unaffected. Capturing against the true CSP is the point: these
 * images have to come from the build a visitor actually gets.
 */
interface TestHooks {
  readonly cityReady: Promise<void>;
  isCityMounted(): boolean;
  freeze(animTime?: number): void;
  renderFrame(): void;
  clearToast(): void;
  suppressToasts(): void;
  setTick(tick: number): void;
}

/**
 * Each callback re-reads the hook object itself. A serialized function
 * carries no closure, so a shared helper defined out here would simply be
 * undefined by the time it ran in the page.
 */
type HookWindow = { __qsimcityTest?: TestHooks };

async function freezeCity(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const test = (window as unknown as HookWindow).__qsimcityTest;
      return !!test && test.isCityMounted();
    },
    undefined,
    { timeout: 90_000 },
  );
  await page.evaluate(() => (window as unknown as HookWindow).__qsimcityTest?.cityReady);
  await page.evaluate(() => {
    const test = (window as unknown as HookWindow).__qsimcityTest;
    if (!test) throw new Error('test hooks missing');
    test.suppressToasts();
    test.freeze(12);
    test.renderFrame();
  });
}

/** Suppress transient messages on surfaces that never mount the 3D city. */
async function quiet2d(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as HookWindow).__qsimcityTest, undefined, {
    timeout: 60_000,
  });
  await page.evaluate(() => {
    const test = (window as unknown as HookWindow).__qsimcityTest;
    if (!test) throw new Error('test hooks missing');
    test.suppressToasts();
    test.clearToast();
  });
}

async function openMode(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name }).click();
}

/** Runs the Bell sample in the lab so every later surface has a real trace. */
async function runBell(page: Page, base: string): Promise<void> {
  await page.goto(`${base}/?view=lab&sample=bell&e2e=1`);
  await quiet2d(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Replay timeline' }).first().waitFor({ timeout: 90_000 });
  // Pin the replay to its final tick: a half-played timeline in a landing
  // page image reads as a stalled app.
  await page.evaluate(() => {
    const test = (window as unknown as HookWindow).__qsimcityTest;
    if (!test) throw new Error('test hooks missing');
    test.setTick(9999);
  });
}

async function shoot(page: Page, file: string, alt: string, shots: Shot[]): Promise<void> {
  const path = join(OUT_DIR, file);
  await page.screenshot({ path, scale: 'css' });
  const bytes = readFileSync(path);
  shots.push({
    file,
    alt,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  console.log(`  ${file.padEnd(28)} ${(bytes.byteLength / 1024).toFixed(0)} KiB`);
}

async function desktopPage(browser: Browser, time: TimeOfDay): Promise<Page> {
  const context = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await seed(page, time);
  return page;
}

async function main(): Promise<void> {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://localhost:${port}`;

  const browser = await chromium.launch({
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars'],
  });
  const shots: Shot[] = [];

  // 1 — hero: the city by day, driven by a trace that has actually run.
  // An empty city has no replay dock, and a landing page that shows one
  // state while its caption describes another is the drift this branch is
  // about.
  {
    const page = await desktopPage(browser, 'day');
    await runBell(page, base);
    await openMode(page, 'Explore');
    await freezeCity(page);
    await shoot(
      page,
      'hero-city-day.png',
      'The QSimCity skyline by day: labelled districts along a coastal grid, one per ' +
        'compilation and execution stage, with the replay timeline docked below the city.',
      shots,
    );
    await page.context().close();
  }

  // 2 — authoring: a mission with the drag-and-drop circuit builder.
  // Entered the way a first-time visitor does, through the welcome dialog's
  // "Play a mission" door. Reaching the same screen by skipping the optional
  // picture quiz left the builder mounted but the template click landing on
  // a stale button, which produced an image of an empty grid.
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    await seed(page, 'day', false);
    await page.goto(`${base}/?e2e=1`);
    await page.getByRole('button', { name: /Play a mission/i }).click();
    const template = page.getByRole('button', { name: 'Bell pair' });
    await template.waitFor({ state: 'visible', timeout: 30_000 });
    await template.click();
    await page
      .getByText(/Bell pair template loaded/i)
      .first()
      .waitFor({ timeout: 30_000 });
    await quiet2d(page);
    await shoot(
      page,
      'step-1-author.png',
      'A guided mission in the circuit builder: a gate palette above a two-lane grid ' +
        'holding a Hadamard, a CX and two measurements, with the mission steps listed above it.',
      shots,
    );
    await context.close();
  }

  // 3 — layout and routing: the city mid-pipeline with the Inspector open.
  {
    const page = await desktopPage(browser, 'day');
    await runBell(page, base);
    await openMode(page, 'Explore');
    await freezeCity(page);
    await page.getByRole('button', { name: 'Legend' }).click();
    await freezeCity(page);
    await shoot(
      page,
      'step-2-legend.png',
      'The City Legend open over the city, naming every animated object and stating ' +
        'that vehicles carry instructions and measured bits, never quantum states.',
      shots,
    );
    await page.context().close();
  }

  // 4 — results and comparison, with every number carrying its label.
  {
    const page = await desktopPage(browser, 'day');
    await runBell(page, base);
    await openMode(page, 'Compare');
    await quiet2d(page);
    await shoot(
      page,
      'step-4-compare.png',
      'Compare mode: the ideal and noisy distributions side by side above a circuit-metrics ' +
        'table showing gate count rising from 2 to 6 through compilation.',
      shots,
    );
    await page.context().close();
  }

  // 6, 7 — the same city at golden hour and at night.
  for (const [time, file, alt] of [
    [
      'golden',
      'city-golden.png',
      'The same city at golden hour: low warm light across the districts, with the ' +
        'wandering coastline and the bay still reading as separate from the land.',
    ],
    [
      'night',
      'city-night.png',
      'The same city at night: lit windows across the districts, street lighting along ' +
        'the boulevards, and the QPU campus glowing at the edge of the grid.',
    ],
  ] as const) {
    const page = await desktopPage(browser, time);
    await page.goto(`${base}/?e2e=1`);
    await openMode(page, 'Explore');
    await freezeCity(page);
    await shoot(page, file, alt, shots);
    await page.context().close();
  }

  // 8 — the WebGL-free surface, which is a first-class way to use the product.
  {
    const page = await desktopPage(browser, 'day');
    await runBell(page, base);
    await openMode(page, 'Accessible 2D');
    await quiet2d(page);
    await shoot(
      page,
      'accessible-2d.png',
      'Accessible 2D: the same trace without WebGL, showing the input and compiled circuit ' +
        'diagrams, the replay timeline, and a provenance panel naming the generator and seed.',
      shots,
    );
    await page.context().close();
  }

  // 9 — a phone, where the layout is genuinely different.
  {
    const context = await browser.newContext({
      viewport: MOBILE,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await seed(page, 'day');
    await runBell(page, base);
    await openMode(page, 'Explore');
    await freezeCity(page);
    await shoot(
      page,
      'mobile-portrait.png',
      'QSimCity on a phone in portrait: the city fills the viewport, with the camera-mode ' +
        'row and Legend above it and the replay dock pinned along the bottom.',
      shots,
    );
    await context.close();
  }

  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  const total = shots.reduce((sum, shot) => sum + shot.bytes, 0);
  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(
      {
        note: 'Captured by pnpm docs:capture from the production build with the deterministic-frame contract engaged.',
        sourceTreeHash: sourceTreeHash(),
        totalBytes: total,
        shots,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n${shots.length} images, ${(total / 1024).toFixed(0)} KiB total.`);
  if (!existsSync(join(OUT_DIR, 'manifest.json'))) throw new Error('manifest not written');
}

await main();
