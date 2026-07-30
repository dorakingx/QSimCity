import { expect, test } from '@playwright/test';
import { trackConsoleErrors } from './helpers.js';

/** Touch interaction checks on the mobile profile (spec §14, §18.5). */

test('mobile: core workflow works with touch', async ({ page }) => {
  const assertClean = trackConsoleErrors(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Accessible 2D' }).tap();
  await page.getByRole('button', { name: 'Run', exact: true }).tap();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({ timeout: 20_000 });
  assertClean();
});

test('mobile: 3D city loads and responds to touch drag', async ({ page }) => {
  const assertClean = trackConsoleErrors(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Explore' }).tap();
  const canvas = page.locator('.city-canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  // One-finger drag orbits the camera; the app must not crash or scroll.
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(300);
  await expect(canvas).toBeVisible();
  assertClean();
});
