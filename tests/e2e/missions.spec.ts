import { expect, test } from '@playwright/test';
import { skipOnboarding, trackConsoleErrors } from './helpers.js';

/**
 * The child-friendly learning path end to end (W6.1, W6.2, W6.6): the real
 * first-run onboarding, and mission 1 completed exactly the way a
 * first-time learner would — by following the on-screen guidance alone:
 * open Play, press the one labeled template button, press Run, watch the
 * celebration.
 */

test('first run shows picture onboarding once and Play opens mission 1', async ({
  page,
  browserName,
}) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Welcome to QSimCity' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Play a mission/ }).click();
  await expect(
    page.getByRole('region', { name: /Mission: Light Up the Twin Towers/ }),
  ).toBeVisible();
  // Returning visit: onboarding stays away.
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Welcome to QSimCity' })).toHaveCount(0);
  assertClean();
});

test('mission 1 is completable from on-screen guidance alone (W6.6)', async ({
  page,
  browserName,
}) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  // The naive user takes the onboarding's primary suggestion.
  await page
    .getByRole('dialog', { name: 'Welcome to QSimCity' })
    .getByRole('button', { name: /Play a mission/ })
    .click();
  const mission = page.getByRole('region', { name: /Mission: Light Up the Twin Towers/ });
  await expect(mission).toBeVisible();
  // Step 1 names the Bell pair button; the button carries the highlight.
  await expect(mission.getByRole('list', { name: 'Mission steps' })).toContainText(/Bell pair/);
  await mission.getByRole('button', { name: 'Bell pair' }).click();
  // Step auto-advances; the guidance now points at Run.
  await expect(mission.getByRole('list', { name: 'Mission steps' })).toContainText(/Done:/);
  await mission.getByRole('button', { name: 'Run', exact: true }).click();
  // Immediate feedback: the celebration appears with the results.
  await expect(mission.locator('.mission-celebration')).toBeVisible({ timeout: 20_000 });
  assertClean();
});

test('missions and builder are available in Accessible 2D Mode (W6.9)', async ({
  page,
  browserName,
}) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await skipOnboarding(page);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  const missions2d = page.locator('.missions-2d');
  await missions2d.locator('summary').click();
  await expect(missions2d.getByRole('list', { name: 'Missions' })).toBeVisible();
  assertClean();
});

test('the City Legend lists the moving entities with their meaning', async ({
  page,
  browserName,
}) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await skipOnboarding(page);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Explore' })
    .click();
  await page.getByRole('button', { name: 'Legend' }).click();
  const legend = page.getByRole('dialog', { name: /City legend/ });
  await expect(legend).toBeVisible();
  await expect(legend.getByRole('heading', { name: 'Job convoy' })).toBeVisible();
  await expect(legend.getByRole('heading', { name: 'Ambient traffic' })).toBeVisible();
  await expect(legend).toContainText(/never a quantum state/i);
  await legend.getByRole('button', { name: 'Close legend' }).click();
  await expect(page.getByRole('dialog', { name: /City legend/ })).toHaveCount(0);
  assertClean();
});
