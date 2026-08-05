import { expect, test } from '@playwright/test';
import { disableWebgl, trackConsoleErrors, skipOnboarding } from './helpers.js';

// Every flow here models a returning user; onboarding has its own spec.
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test('WebGL failure never blanks the page: 2D fallback carries the full workflow', async ({
  page,
  browserName,
}) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await disableWebgl(page);
  await page.goto('/');
  // The home screen must announce the fallback.
  await expect(page.getByText(/Accessible 2D\s*Mode/).first()).toBeVisible();
  // Explore mode falls back to 2D instead of a blank canvas.
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Explore' })
    .click();
  await expect(page.getByRole('status').first()).toContainText(/Accessible 2D Mode/);
  // The complete core workflow still works: run and inspect results.
  await page.getByRole('button', { name: 'Run', exact: true }).first().click();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole('group', { name: 'Input circuit (as written)' }).first(),
  ).toBeVisible();
  assertClean();
});

test('trace import/export round-trips through the UI', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
    timeout: 20_000,
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export trace' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.qsimcity\.json$/);
  const path = await download.path();
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import trace' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path);
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible();
  await expect(page.getByText('Trace imported.')).toBeVisible();
});

test('malformed trace import is rejected with a readable error', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import trace' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'evil.qsimcity.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":"1.0.0","nope":true}'),
  });
  await expect(page.getByRole('alert')).toContainText(/failed|invalid|validation/i);
});
