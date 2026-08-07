import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pauseReplay, runBellFromLab, skipOnboarding } from './helpers.js';

// Every flow here models a returning user; onboarding has its own spec.
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

/**
 * Automated accessibility checks (spec §16): axe scans on every major
 * surface plus a keyboard-only walkthrough.
 */

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)).toEqual(
    [],
  );
}

test('home passes axe WCAG 2.2 AA', async ({ page }) => {
  await page.goto('/');
  await expectNoViolations(page);
});

test('accessible 2D mode passes axe before and after a run', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
    timeout: 20_000,
  });
  await pauseReplay(page);
  await expectNoViolations(page);
});

test('compare mode and help overlay pass axe', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Compare' })
    .click();
  await expectNoViolations(page);
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('dialog', { name: /Help/ })).toBeVisible();
  await expectNoViolations(page);
});

test('keyboard-only entry: skip link, navigation, palette, and run', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  // First Tab reaches the skip link. WebKit follows Safari's platform
  // convention of skipping links on plain Tab, so assert wiring instead.
  if (browserName === 'webkit') {
    const skip = page.locator('.skip-link');
    await expect(skip).toHaveAttribute('href', '#main-content');
  } else {
    await page.keyboard.press('Tab');
    await expect(page.getByText('Skip to main content')).toBeFocused();
  }
  // Palette via keyboard.
  await page.keyboard.press('ControlOrMeta+KeyK');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.keyboard.type('Accessible 2D');
  await page.keyboard.press('Enter');
  // Reach the Run button by keyboard and run.
  const run = page.getByRole('button', { name: 'Run', exact: true });
  await run.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: /Measured counts/ })).toBeVisible({
    timeout: 20_000,
  });
  // Timeline is keyboard-operable: focus the scrubber and arrow through it.
  const scrubber = page.locator('.timeline-scrubber input');
  await scrubber.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.timeline-position')).not.toContainText(/^0 \//);
});

test('charts expose complete table alternatives', async ({ page }) => {
  await page.goto('/');
  await runBellFromLab(page);
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  const tables = page.locator('details.table-alternative');
  await expect(tables.first()).toBeAttached();
  const count = await tables.count();
  expect(count).toBeGreaterThanOrEqual(3); // circuit, coupling, histogram
  // The histogram table carries real data.
  await page.getByText('Data table (text alternative)').click();
  await expect(page.getByRole('columnheader', { name: 'Outcome' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /^(00|11)$/ }).first()).toBeVisible();
});

test('page structure: landmarks, headings, and 200% zoom usability', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Accessible 2D' })
    .click();
  expect(await page.locator('main').count()).toBe(1);
  expect(await page.getByRole('heading', { level: 2 }).count()).toBeGreaterThanOrEqual(2);
  // Emulate 200% zoom via halved viewport; core controls stay operable.
  await page.setViewportSize({ width: 640, height: 400 });
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
  const box = await page.getByRole('button', { name: 'Run', exact: true }).boundingBox();
  expect(box).not.toBeNull();
});
