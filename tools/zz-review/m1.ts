import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createProductionServer } from '../serve-production.js';

const OUT = '/private/tmp/claude-501/-Users-hatanakatomoya-Developer-App-QSimCity--claude-worktrees-qsimcity-real-city-wiser-444293/2461c249-0ca6-4072-ac96-9af7dda47786/scratchpad/shots';
mkdirSync(OUT, { recursive: true });

const log = (...a: unknown[]) => console.log('[m1]', ...a);

async function panelText(page: Page): Promise<string> {
  return (await page.locator('.mission-panel').first().innerText().catch(() => '(no mission panel)'));
}

async function run(): Promise<void> {
  const server = createProductionServer();
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const base = `http://localhost:${port}`;
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] });

  for (const profile of ['desktop', 'phone'] as const) {
    const ctx = await browser.newContext(
      profile === 'desktop'
        ? { viewport: { width: 1440, height: 900 }, bypassCSP: true }
        : {
            viewport: { width: 412, height: 915 },
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 2.625,
            userAgent:
              'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            bypassCSP: true,
          },
    );
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log(profile, 'PAGEERROR', e.message));
    await page.goto(base);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${profile}-01-onboarding.png` });
    log(profile, 'onboarding visible:', await page.getByRole('dialog', { name: /Welcome/ }).isVisible().catch(() => false));
    log(profile, 'onboarding text:', (await page.locator('.onboarding').innerText().catch(() => '?')).replace(/\n/g, ' | '));

    // Child register + Play a mission
    await page.getByRole('radio', { name: 'Kids' }).click();
    await page.getByRole('button', { name: 'Play a mission' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${profile}-02-mission-entry.png`, fullPage: false });
    log(profile, 'PRE-QUIZ shown?', await page.getByText(/picture quiz|Question 1|quiz/i).first().isVisible().catch(() => false));
    log(profile, 'panel after entry:\n' + (await panelText(page)));

    // Is the Run/template button visible without scrolling?
    const tpl = page.locator('[data-mission-target="builder-bell-template"]');
    log(profile, 'template btn count', await tpl.count());
    if (await tpl.count()) {
      const box = await tpl.first().boundingBox();
      const vp = page.viewportSize();
      log(profile, 'template box', JSON.stringify(box), 'viewport', JSON.stringify(vp));
      log(profile, 'template in initial viewport?', box && vp ? box.y + box.height <= vp.height : 'n/a');
    }

    // Step 1: press the Bell pair template
    const t0 = Date.now();
    await tpl.first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${profile}-03-after-template.png` });
    log(profile, 'panel after template:\n' + (await panelText(page)));

    // Step 2: Run
    const runBtn = page.locator('[data-mission-target="builder-run"]');
    log(profile, 'run btn count', await runBtn.count());
    const runBox = await runBtn.first().boundingBox();
    const vp2 = page.viewportSize();
    log(profile, 'run box', JSON.stringify(runBox), 'in viewport?', runBox && vp2 ? runBox.y + runBox.height <= vp2.height : 'n/a');
    await runBtn.first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${profile}-04-after-run.png` });
    log(profile, 'panel after run:\n' + (await panelText(page)));

    // Poll for celebration
    const tRun = Date.now();
    let celebAt = -1;
    for (let i = 0; i < 120; i++) {
      const c = await page.locator('.mission-celebration').count();
      if (c > 0) { celebAt = Date.now() - tRun; break; }
      await page.waitForTimeout(250);
    }
    log(profile, 'celebration appeared ms after Run click:', celebAt);
    log(profile, 'total ms from template click:', Date.now() - t0);
    await page.screenshot({ path: `${OUT}/${profile}-05-celebration.png` });
    log(profile, 'panel at celebration:\n' + (await panelText(page)));

    // maxTick + tick timing
    const info = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return JSON.stringify({ keys: Object.keys(w).filter((k) => k.startsWith('__qsimcity')) });
    });
    log(profile, 'window hooks', info);

    await ctx.close();
  }
  await browser.close();
  server.close();
}

await run();
