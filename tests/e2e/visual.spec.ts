import { expect, test } from '@playwright/test';
import { disableWebgl, runBellFromLab, skipOnboarding } from './helpers.js';

// One worker per project for this file: several WebGL cities rendering in
// parallel contend for the GPU and keep screenshots from stabilizing.
test.describe.configure({ mode: 'default' });

// Every flow here models a returning user; onboarding has its own spec.
// Baselines run under the app's reduced-motion contract: ambient city life
// (traffic, pedestrians, cloud drift) pauses, so consecutive frames are
// stable enough to snapshot. Ambient motion is covered by unit tests, the
// FPS benchmark, and the reviewed WISER screenshot set instead.
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  await page.addInitScript(() => {
    const key = 'qsimcity.settings.v1';
    let settings: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(key);
      if (raw) settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      settings = {};
    }
    settings['reducedMotion'] = true;
    localStorage.setItem(key, JSON.stringify(settings));
  });
});

/**
 * Visual regression (spec §18.5): the required surface set. Chromium
 * renders desktop surfaces; the mobile project renders portrait/landscape.
 */

test.describe('desktop surfaces', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /QSimCity/ })).toBeVisible();
    await expect(page).toHaveScreenshot('home.png');
  });

  test('city day (explore, default view)', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    // City assets, first frames, and the offline-ready toast's 5 s life.
    await page.waitForTimeout(6500);
    await expect(page).toHaveScreenshot('city-day.png', { timeout: 20_000 });
  });

  test('city night (explore)', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Time of day').selectOption('night');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(6500);
    await expect(page).toHaveScreenshot('city-night.png', { timeout: 20_000 });
  });

  test('city golden hour (explore)', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Time of day').selectOption('golden');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(6500);
    await expect(page).toHaveScreenshot('city-golden.png', { timeout: 20_000 });
  });

  test('city first-person', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^Walk/ }).click();
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('city-first-person.png');
  });

  test('quantum lab with results', async ({ page }) => {
    await page.goto('/');
    await runBellFromLab(page);
    await page.getByRole('button', { name: 'Pause replay' }).click();
    await expect(page).toHaveScreenshot('lab-results.png');
  });

  test('compare mode', async ({ page }) => {
    await page.goto(
      '/?sample=bell&shots=1024&seed=visual&device=linear-5&noise=0.05,0.001,0.01,0.02,0.02',
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
    await expect(page).toHaveScreenshot('compare.png', { fullPage: false });
  });

  test('accessible 2D with results', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Accessible 2D' })
      .click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Pause replay' }).click();
    await expect(page).toHaveScreenshot('accessible-2d.png');
  });

  test('webgl-disabled fallback', async ({ page }) => {
    await disableWebgl(page);
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await expect(page.getByRole('status').first()).toContainText(/Accessible 2D Mode/);
    await expect(page).toHaveScreenshot('webgl-fallback.png');
  });

  test('offline mode still serves the app shell', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForTimeout(2000); // allow SW precache
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: /QSimCity/ })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveScreenshot('offline-home.png');
    await context.setOffline(false);
  });
});

test.describe('mobile surfaces', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('mobile portrait 2D', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Accessible 2D' })
      .click();
    await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('mobile-portrait.png');
  });

  test('mobile landscape city', async ({ page }) => {
    await page.setViewportSize({ width: 915, height: 412 });
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: 'Explore' })
      .click();
    await page.waitForTimeout(2500);
    await expect(page).toHaveScreenshot('mobile-landscape.png');
  });
});
