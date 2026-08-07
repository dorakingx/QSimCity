import { expect, test } from '@playwright/test';
import {
  disableWebgl,
  e2eUrl,
  freezeCity,
  runBellFromLab,
  settle2d,
  skipOnboarding,
} from './helpers.js';

// Serial: rendering the city is expensive, and on a GPU-less CI runner it
// is expensive in software. Two cities racing for the same rasterizer is
// what turned this file into nine 60-second timeouts in one CI run.
test.describe.configure({ mode: 'serial' });

/**
 * Every flow models a returning user; onboarding has its own spec.
 *
 * Frames are pinned by the deterministic-frame contract (see `freezeCity`)
 * rather than by sleeping and hoping. Ambient city life is *not* disabled
 * for these baselines — traffic, strollers and clouds are pure functions of
 * `animTime`, which the contract fixes, so they appear in the shot at a
 * known phase. That means the baselines actually cover the living city
 * instead of an emptied one.
 */
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

/**
 * Visual regression (spec §18.5): the required surface set. Chromium
 * renders desktop surfaces; the mobile project renders portrait/landscape.
 */

test.describe('desktop surfaces', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('home', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await expect(page.getByRole('heading', { name: /QSimCity/ })).toBeVisible();
    await settle2d(page);
    await expect(page).toHaveScreenshot('home.png');
  });

  test('city day (explore, default view)', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await freezeCity(page);
    await expect(page).toHaveScreenshot('city-day.png');
  });

  test('city night (explore)', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Time of day').selectOption('night');
    await page.keyboard.press('Escape');
    await freezeCity(page);
    await expect(page).toHaveScreenshot('city-night.png');
  });

  test('city golden hour (explore)', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Time of day').selectOption('golden');
    await page.keyboard.press('Escape');
    await freezeCity(page);
    await expect(page).toHaveScreenshot('city-golden.png');
  });

  test('city first-person', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await freezeCity(page);
    await page.getByRole('button', { name: /^Walk/ }).click();
    // Re-freeze: switching camera mode restarts motion.
    await freezeCity(page);
    await expect(page).toHaveScreenshot('city-first-person.png');
  });

  test('quantum lab with results', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await runBellFromLab(page);
    await freezeCity(page, { tick: 0 });
    await expect(page).toHaveScreenshot('lab-results.png');
  });

  test('compare mode', async ({ page }) => {
    await page.goto(
      e2eUrl(
        '/?sample=bell&shots=1024&seed=visual&device=linear-5&noise=0.05,0.001,0.01,0.02,0.02',
      ),
    );
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Replay timeline' })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Compare' })
      .click();
    await expect(page.getByRole('heading', { name: 'Ideal vs noisy' })).toBeVisible();
    await settle2d(page);
    await expect(page).toHaveScreenshot('compare.png', { fullPage: false });
  });

  test('accessible 2D with results', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Accessible 2D' })
      .click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Pause replay' }).click();
    await settle2d(page);
    await expect(page).toHaveScreenshot('accessible-2d.png');
  });

  test('webgl-disabled fallback', async ({ page }) => {
    await disableWebgl(page);
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await expect(page.getByRole('status').first()).toContainText(/Accessible 2D Mode/);
    await settle2d(page);
    await expect(page).toHaveScreenshot('webgl-fallback.png');
  });

  test('offline mode still serves the app shell', async ({ page, context }) => {
    await page.goto(e2eUrl('/'));
    // Wait for the service worker to finish precaching rather than sleeping.
    await page.waitForFunction('navigator.serviceWorker.controller !== null', undefined, {
      timeout: 30_000,
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: /QSimCity/ })).toBeVisible({ timeout: 15_000 });
    await settle2d(page);
    await expect(page).toHaveScreenshot('offline-home.png');
    await context.setOffline(false);
  });
});

test.describe('mobile surfaces', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('mobile portrait 2D', async ({ page }) => {
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Accessible 2D' })
      .click();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
    await settle2d(page);
    await expect(page).toHaveScreenshot('mobile-portrait.png');
  });

  test('mobile landscape city', async ({ page }) => {
    await page.setViewportSize({ width: 915, height: 412 });
    await page.goto(e2eUrl('/'));
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await freezeCity(page);
    await expect(page).toHaveScreenshot('mobile-landscape.png');
  });
});
