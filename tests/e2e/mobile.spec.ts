import { expect, test } from './fixtures.js';
import { trackConsoleErrors, skipOnboarding } from './helpers.js';

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
  // Place a gate with taps alone first: arm a palette tile, tap a grid
  // cell, and confirm the tile landed (W6.2 is tap-to-place, not just the
  // template shortcut).
  await mission.getByRole('button', { name: /^Hadamard/ }).tap();
  await mission.locator('[data-cell="0-0"]').tap();
  await expect(mission.locator('.builder-cell.filled')).toHaveCount(1);
  // Remove it by tapping its remove control, still touch-only.
  await mission.getByRole('button', { name: /Remove Hadamard/ }).tap();
  await expect(mission.locator('.builder-cell.filled')).toHaveCount(0);
  // Tap the one-tap template, then Run — the whole mission by touch.
  await mission.getByRole('button', { name: 'Bell pair' }).tap();
  await mission.getByRole('button', { name: 'Run', exact: true }).tap();
  await expect(mission.locator('.mission-celebration')).toBeVisible({ timeout: 20_000 });
  // Regression guard: the post-run results must not overflow the phone
  // viewport — a clipped celebration is an unreachable payoff (child-UX
  // review). Nothing inside the mission panel may exceed its box.
  const overflow = await mission.evaluate((node) =>
    Math.max(0, node.scrollWidth - node.clientWidth),
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const docOverflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  );
  expect(docOverflow).toBeLessThanOrEqual(1);
  // The 3D touch walk controls are covered by city3d.spec.ts, which runs
  // in the projects that actually have WebGL.
  assertClean();
});
