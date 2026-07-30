import { expect, type Page } from '@playwright/test';

/**
 * Console-error tracking: uncaught exceptions, unhandled rejections, and
 * unexpected console errors fail the test (spec §18.5).
 */
export function trackConsoleErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Benign environment noise that is not an application defect.
      if (text.includes('favicon') || text.includes('Download the React DevTools')) return;
      errors.push(text);
    }
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return () => expect(errors, 'console must stay clean').toEqual([]);
}

/** Runs the default Bell sample from the Lab and waits for the timeline. */
export async function runBellFromLab(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Modes' })
    .getByRole('button', { name: 'Quantum Lab' })
    .click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Replay timeline' })).toBeVisible({
    timeout: 20_000,
  });
}

/** Disables WebGL2 before app scripts run (fallback testing). */
export async function disableWebgl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl2' || type === 'webgl') return null;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return (original as any).call(this, type, ...args);
    };
  });
}
