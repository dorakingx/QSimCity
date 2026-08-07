import { expect, test } from './fixtures.js';
import { pauseReplay, runBellFromLab, skipOnboarding, trackConsoleErrors } from './helpers.js';

// Every flow here models a returning user; onboarding has its own spec.
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test('home page presents the product and three entry points', async ({ page, browserName }) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  await expect(page).toHaveTitle(/QSimCity/);
  await expect(page.getByRole('heading', { name: /QSimCity/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guided Tour' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Quantum Lab' }).first()).toBeVisible();
  // The independence disclaimer is a product requirement and is independent of
  // licensing; the license wording itself is checked against the LICENSE file
  // by `pnpm goal:check`, not here.
  await expect(page.getByText('unofficial, independent educational and research')).toBeVisible();
  assertClean();
});

test('every mode is reachable from the header without errors', async ({ page, browserName }) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  for (const mode of ['Quantum Lab', 'Compare', 'Accessible 2D', 'Explore', 'Guided Tour']) {
    await page
      .getByRole('navigation', { name: 'Modes' })
      .getByRole('button', { name: mode })
      .click();
    await expect(
      page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: mode }),
    ).toHaveAttribute('aria-current', 'page');
  }
  assertClean();
});

test('running the Bell sample produces synchronized results in 2D', async ({
  page,
  browserName,
}) => {
  const assertClean = trackConsoleErrors(page, browserName);
  await page.goto('/');
  await runBellFromLab(page);
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  await expect(
    page.getByRole('group', { name: 'Input circuit (as written)' }).first(),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: /Compiled circuit/ }).first()).toBeVisible();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible();
  await expect(page.getByRole('group', { name: /Coupling map/ })).toBeVisible();
  // Timeline stepping updates the tick display.
  const position = page.locator('.timeline-position');
  await pauseReplay(page);
  const before = await position.textContent();
  await page.getByRole('button', { name: 'Step forward one tick' }).click();
  const after = await position.textContent();
  expect(after).not.toBe(before);
  assertClean();
});

test('parser errors report line and column and preserve input', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  const editor = page.getByLabel(/OpenQASM 2.0 program/);
  await editor.fill('OPENQASM 2.0;\nqreg q[1];\nfrobnicate q[0];');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Line 3');
  await expect(alert).toContainText('frobnicate');
  await expect(editor).toHaveValue(/frobnicate/);
});

test('command palette opens, filters, and executes commands', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+KeyK');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('compare');
  await page.keyboard.press('Enter');
  await expect(palette).not.toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Compare' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('help overlay shows keyboard map and closes with Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help' }).click();
  const dialog = page.getByRole('dialog', { name: /Help/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Keyboard map')).toBeVisible();
  await expect(dialog.getByText('District legend')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('share URL restores a sample configuration', async ({ page }) => {
  await page.goto('/?sample=ghz-4&shots=2048&seed=shared&device=grid-3x3');
  await expect(page.getByLabel('Sample circuit').first()).toHaveValue('ghz-4');
  await expect(page.getByLabel('Shots').first()).toHaveValue('2048');
  await expect(page.getByLabel('Seed').first()).toHaveValue('shared');
  await expect(page.getByLabel('Device topology').first()).toHaveValue('grid-3x3');
});
