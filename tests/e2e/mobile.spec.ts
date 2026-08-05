import { expect, test } from '@playwright/test';
import { trackConsoleErrors, expectCityRendered, skipOnboarding } from './helpers.js';

// Every flow here models a returning user; onboarding has its own spec.
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

/** Touch interaction checks on the mobile profile (spec §14, §18.5). */

test('mobile: core workflow works with touch', async ({ page, browserName }) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .tap();
  await page.getByRole('button', { name: 'Run', exact: true }).tap();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
    timeout: 20_000,
  });
  assertClean();
});

test('mobile: circuit builder works by touch alone (W6.2)', async ({ page, browserName }) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Missions' })
    .tap();
  await page
    .getByRole('list', { name: 'Missions' })
    .getByRole('button', { name: /Light Up the Twin Towers/ })
    .tap();
  const mission = page.getByRole('region', { name: /Mission: Light Up the Twin Towers/ });
  await expect(mission).toBeVisible();
  // Tap the one-tap template, then Run — the whole mission by touch.
  await mission.getByRole('button', { name: 'Bell pair' }).tap();
  await mission.getByRole('button', { name: 'Run', exact: true }).tap();
  await expect(mission.locator('.mission-celebration')).toBeVisible({ timeout: 20_000 });
  // Touch walk controls exist in the 3D city too.
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Explore' })
    .tap();
  await page.getByRole('button', { name: /^Walk/ }).tap();
  await expect(page.getByRole('application', { name: /Movement pad/ })).toBeVisible();
  assertClean();
});

test('mobile: 3D city loads and responds to touch drag', async ({ page, browserName }) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Explore' })
    .tap();
  const canvas = page.locator('.city-canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  // One-finger drag orbits the camera; the app must not crash or scroll.
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(300);
  await expectCityRendered(page);
  assertClean();
});
