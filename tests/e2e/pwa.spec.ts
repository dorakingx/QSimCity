import { expect, test } from '@playwright/test';
import { trackConsoleErrors } from './helpers.js';

/** PWA behavior (spec §17): manifest, service worker, offline startup. */

test('serves a valid web app manifest', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest.name).toBe('QSimCity');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});

test('registers a service worker that precaches the shell', async ({ page }) => {
  await page.goto('/');
  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active !== null;
  });
  expect(registered).toBe(true);
});

test('offline startup after first load: full run works without network', async ({
  page,
  context,
  browserName,
}) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /QSimCity/ })).toBeVisible({ timeout: 15_000 });
  // Bundled samples work offline: run the Bell sample end to end.
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
    timeout: 20_000,
  });
  await context.setOffline(false);
  assertClean();
});

test('security: no external requests are made by the app shell', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      externalRequests.push(req.url());
    }
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
    timeout: 20_000,
  });
  expect(externalRequests, 'no telemetry, no CDNs, no third-party calls').toEqual([]);
});
