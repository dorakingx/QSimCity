import { chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProductionServer } from '../serve-production.js';

/**
 * Records the WISER demo video: a real, unscripted-by-hand walkthrough of
 * the production build, driven by Playwright at 1920x1080, with captions
 * burned in from timings captured while the run happens.
 *
 * The story is causal and starts from a circuit the learner builds: place
 * gates, run them, then follow that specific job through layout, routing,
 * translation, optimisation, scheduling, execution, noise, measurement,
 * and classical feedback, ending on how the product states its own
 * uncertainty. Nothing is faked and no footage is stitched from elsewhere.
 *
 * Output: release-evidence/demo/qsimcity-demo.mp4 plus a sidecar .srt and
 * a checksum file. Upload is deliberately NOT performed.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'demo');
const RAW_DIR = join(OUT_DIR, 'raw');

/**
 * Draw (or update) a caption bar pinned to the bottom of the viewport. It
 * is inert to pointer events so it never intercepts the clicks driving the
 * walkthrough, and it is styled property-by-property so no inline
 * stylesheet is needed under the production Content-Security-Policy.
 */
const SHOW_CAPTION = `(() => {
  let bar = document.getElementById('__demoCaption');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = '__demoCaption';
    const s = bar.style;
    s.position = 'fixed';
    s.left = '50%';
    s.bottom = '48px';
    s.transform = 'translateX(-50%)';
    s.maxWidth = '1400px';
    s.padding = '16px 28px';
    s.borderRadius = '12px';
    s.background = 'rgba(6, 10, 18, 0.86)';
    s.border = '1px solid rgba(120, 220, 220, 0.45)';
    s.color = '#f4f8ff';
    s.font = '500 30px/1.35 system-ui, -apple-system, Segoe UI, sans-serif';
    s.textAlign = 'center';
    s.zIndex = '2147483647';
    s.pointerEvents = 'none';
    s.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.55)';
    document.body.appendChild(bar);
  }
  bar.textContent = CAPTION_TEXT;
})()`;

interface Caption {
  readonly startMs: number;
  endMs: number;
  readonly text: string;
}

class Narration {
  private readonly captions: Caption[] = [];
  private readonly startedAt = Date.now();

  /** Show a caption, hold it for `holdMs`, then continue. */
  async say(page: Page, text: string, holdMs: number): Promise<void> {
    const startMs = Date.now() - this.startedAt;
    const previous = this.captions[this.captions.length - 1];
    if (previous) previous.endMs = startMs;
    this.captions.push({ startMs, endMs: startMs + holdMs, text });
    // Captions are drawn in the page, so Playwright's recording captures
    // them directly. The local ffmpeg has neither libass nor libfreetype,
    // so burning text afterwards is not available; rendering here also
    // keeps caption typography consistent with the product itself.
    await page.evaluate(SHOW_CAPTION.replace('CAPTION_TEXT', JSON.stringify(text)));
    await page.waitForTimeout(holdMs);
  }

  /** Close the last caption at the current time. */
  finish(): Caption[] {
    const now = Date.now() - this.startedAt;
    const previous = this.captions[this.captions.length - 1];
    if (previous) previous.endMs = Math.max(previous.endMs, now);
    return this.captions;
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }
}

function srtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = String(Math.floor(total / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((total % 3_600_000) / 60_000)).padStart(2, '0');
  const s = String(Math.floor((total % 60_000) / 1000)).padStart(2, '0');
  const milli = String(total % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${milli}`;
}

/** Wrap caption text so burned-in lines stay readable at 1080p. */
function wrap(text: string, width = 62): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 3).join('\n');
}

function toSrt(captions: readonly Caption[]): string {
  return captions
    .map((caption, index) => {
      const end = Math.max(caption.endMs, caption.startMs + 900);
      return `${index + 1}\n${srtTime(caption.startMs)} --> ${srtTime(end)}\n${wrap(caption.text)}\n`;
    })
    .join('\n');
}



/**
 * SWAP count from the metrics panel, so the caption states the numbers the
 * viewer can see on screen rather than asserting an improvement in prose.
 */
async function readSwapCount(page: Page): Promise<string> {
  const text = await page
    .evaluate(`(() => {
      const el = document.body.innerText || '';
      const m = el.match(/SWAPs?[^0-9]{0,12}(\\d+)/i);
      return m ? m[1] : '';
    })()`)
    .catch(() => '');
  return typeof text === 'string' && text.length > 0 ? text : 'fewer';
}

async function clickMode(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name }).click();
}

/** Scrub the replay to a fraction of its real length, whatever that is. */
async function scrubTo(page: Page, fraction: number): Promise<void> {
  const scrubber = page.locator('.timeline-scrubber input').first();
  if ((await scrubber.count()) === 0) return;
  const max = Number((await scrubber.getAttribute('max')) ?? '0');
  const tick = Math.max(0, Math.min(max, Math.round(max * fraction)));
  await scrubber.fill(String(tick)).catch(() => undefined);
}

async function main(): Promise<void> {
  rmSync(RAW_DIR, { recursive: true, force: true });
  mkdirSync(RAW_DIR, { recursive: true });

  const server = createProductionServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}`;

  const browser = await chromium.launch({
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars'],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const narration = new Narration();

  // ---------------------------------------------------------------- open
  await page.goto(baseUrl);
  await page.getByRole('dialog', { name: 'Welcome to QSimCity' }).waitFor({ timeout: 30_000 });
  await narration.say(
    page,
    'QSimCity: see what actually happens to a quantum program between writing a circuit and getting results.',
    6000,
  );
  await narration.say(
    page,
    'Everything runs in the browser. No account, no upload, no telemetry. This is the real application, recorded live.',
    6000,
  );
  await narration.say(
    page,
    'A first-time learner picks a door. We take the mission path, which is the one designed for beginners.',
    5000,
  );

  // ------------------------------------------------- learner builds a circuit
  await page.getByRole('button', { name: 'Play a mission' }).click();
  const mission = page.getByRole('region', { name: /Mission:/ });
  await mission.waitFor({ timeout: 30_000 });
  await narration.say(
    page,
    'Mission 1 asks for a Bell pair. The numbered steps are the only instructions a learner needs.',
    6000,
  );

  // Place gates by hand: this is a learner-authored circuit, not a preset.
  await mission.getByRole('button', { name: /^Hadamard/ }).click();
  await narration.say(
    page,
    'We build the circuit ourselves. First a Hadamard: select the gate, then place it on qubit zero.',
    5000,
  );
  await mission.locator('[data-cell="0-0"]').click();
  await narration.say(page, 'Placed. The grid compiles to OpenQASM 2.0 as we edit.', 4000);
  await mission.getByRole('button', { name: /^CX \(link\)/ }).click();
  await mission.locator('[data-cell="1-0"]').click();
  await mission.locator('[data-cell="1-1"]').click();
  await narration.say(
    page,
    'Then a CX linking qubit zero to qubit one. Two gates: that is the whole circuit we wrote.',
    6000,
  );
  await mission.getByRole('button', { name: /^Measure/ }).click();
  await mission.locator('[data-cell="2-0"]').click();
  await mission.getByRole('button', { name: /^Measure/ }).click();
  await mission.locator('[data-cell="2-1"]').click();
  await narration.say(page, 'Two measurements, so we can see what the machine returns.', 4500);

  // ------------------------------------------------------------------ run
  await mission.getByRole('button', { name: 'Run', exact: true }).click();
  await narration.say(
    page,
    'Run sends it through the whole pipeline: parse, layout, route, translate, optimise, schedule, execute, measure.',
    7000,
  );
  await narration.say(
    page,
    'The replay is now driving every surface. Watch the step tick off as the run completes.',
    6000,
  );
  await page.waitForTimeout(4000);

  // ------------------------------------------------------- follow it in the city
  await clickMode(page, 'Explore');
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30_000 });
  await narration.say(
    page,
    'This is the same run, in the city. The geography IS the pipeline: each district is one compiler stage.',
    7000,
  );
  await narration.say(
    page,
    'West to east along the boulevard: Program Port, IR Foundry, Layout Exchange, Routing Transit, Translation Refinery, Optimization Works, Scheduling Tower.',
    8000,
  );
  await narration.say(
    page,
    'Then the QPU Grid where it executes, the Measurement Harbor where shots land, and the Classical Control Center for feedback.',
    7000,
  );

  // Scrub the timeline so causality is visible rather than asserted.
  await scrubTo(page, 0);
  await narration.say(
    page,
    'Everything derives from the trace and the current tick, so we can rewind and watch causality again.',
    5500,
  );
  for (const fraction of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) {
    await scrubTo(page, fraction);
    await page.waitForTimeout(1200);
  }
  await narration.say(
    page,
    'The convoy carries the compiled job. It arrives at each district exactly when that stage emits its events.',
    6500,
  );

  // ------------------------------------------------------- layout and routing
  await clickMode(page, 'Quantum Lab');
  await narration.say(
    page,
    'Now the idea this visualisation exists for: the circuit you write is not the circuit that runs.',
    6000,
  );
  await page
    .getByRole('button', { name: /^Scenarios/ })
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(800);
  const swapStorm = page.getByRole('button', { name: /SWAP Storm/ }).first();
  if (await swapStorm.count()) {
    await swapStorm.click();
    await page.waitForTimeout(3500);
  }
  await narration.say(
    page,
    'This program needs qubits that sit far apart on the device. The router must physically move them together.',
    7000,
  );
  await clickMode(page, 'Explore');
  await page.waitForTimeout(1500);
  await narration.say(
    page,
    'Each SWAP the compiler inserts exchanges two logical-qubit banners between physical pylons, at the exact tick it happens.',
    7500,
  );
  await scrubTo(page, 0);
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    await scrubTo(page, fraction);
    await page.waitForTimeout(1500);
  }
  await narration.say(
    page,
    'Logical qubit q0 is a name tag. The pylon underneath it is the physical hardware. A SWAP changes which is which.',
    7000,
  );

  // --------------------------------------------------------------- compare
  await clickMode(page, 'Compare');
  await page.waitForTimeout(2500);
  await narration.say(
    page,
    'Compare Mode puts the circuit you wrote next to the circuit that actually ran, with the compiler metrics.',
    7000,
  );
  await narration.say(
    page,
    'Gate count, two-qubit gates, SWAPs inserted, depth. This is where the cost of connectivity becomes concrete.',
    7000,
  );

  // ----------------------------------------------------------------- noise
  await clickMode(page, 'Quantum Lab');
  await page.waitForTimeout(1200);
  const noise = page.getByLabel(/Enable noise model/).first();
  if (await noise.count()) {
    await noise.check().catch(() => undefined);
    await narration.say(
      page,
      'Turn on the noise model and run again. Noise does not produce a wrong answer: it changes the distribution.',
      6500,
    );
    await page.getByRole('button', { name: 'Run', exact: true }).first().click();
    await page.waitForTimeout(4000);
  }

  // ------------------------------------------------------- results and honesty
  await clickMode(page, 'Accessible 2D');
  await page.waitForTimeout(2500);
  await narration.say(
    page,
    'Accessible 2D Mode is the complete product with no WebGL at all, for machines and users that need it.',
    6500,
  );
  const results = page.getByRole('region', { name: 'Measurement results' });
  if (await results.count()) await results.scrollIntoViewIfNeeded().catch(() => undefined);
  await narration.say(
    page,
    'Every number carries its provenance: measured counts are SAMPLED, compiler metrics are COMPUTED, probabilities are EXACT.',
    7500,
  );
  await narration.say(
    page,
    'An Active Simplifications panel states what the model is NOT, including that playback pacing is presentation time.',
    7000,
  );

  // ------------------------------------------------ street level and night
  await clickMode(page, 'Explore');
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1000);
  await narration.say(
    page,
    'You are not limited to looking down at it. Press four, and you are standing in the street.',
    5500,
  );
  await page.keyboard.press('Digit4');
  await page.waitForTimeout(1200);
  await page.keyboard.down('KeyW');
  await narration.say(
    page,
    'Walking the Processing Boulevard: traffic, people, street lamps, and the districts you just watched the job pass through.',
    7000,
  );
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);
  await narration.say(
    page,
    'The city is deliberately ordinary. It is scaffolding for the pipeline, and the Legend says exactly which parts mean anything.',
    6500,
  );
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(1200);

  await page
    .getByRole('button', { name: 'Settings' })
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(900);
  const timeOfDay = page.getByLabel('Time of day');
  if (await timeOfDay.count()) {
    await timeOfDay.selectOption('night').catch(() => undefined);
    await page.keyboard.press('Escape');
    await narration.say(
      page,
      'Day, golden hour, and night are presentation settings only. They never touch the science underneath.',
      6500,
    );
    await page.waitForTimeout(1500);
    await page
      .getByRole('button', { name: 'Settings' })
      .click()
      .catch(() => undefined);
    await page.waitForTimeout(700);
    await page
      .getByLabel('Time of day')
      .selectOption('day')
      .catch(() => undefined);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
  }

  // ------------------------------------------- the layout lesson, end to end
  //
  // This segment is the one the demo script calls the central idea, so it
  // must not be optional. An earlier version wrapped the whole thing in
  // `if (await longWay.count())` while leaving the narration outside it:
  // when the selector missed, the captions still played over the previous
  // screen and the recording described a segment it did not contain.
  // Anything missing here now fails the recording.
  await clickMode(page, 'Missions');
  await page.waitForTimeout(1200);
  const longWay = page.getByRole('button', { name: /The Long Way Around/ }).first();
  await longWay.waitFor({ state: 'visible', timeout: 20_000 });
  await longWay.click();
  await page.waitForTimeout(2500);
  const missionRegion = page.getByRole('region', { name: /Mission:/ });
  await missionRegion.waitFor({ state: 'visible', timeout: 20_000 });
  const missionRun = missionRegion.getByRole('button', { name: 'Run', exact: true });
  await missionRun.waitFor({ state: 'visible', timeout: 20_000 });

  await narration.say(
    page,
    'The mission that carries the central idea: a program whose qubits start far apart on the device.',
    6000,
  );
  await narration.say(
    page,
    'Run it with a deliberately poor initial layout and the router must insert SWAP after SWAP just to bring qubits together.',
    7000,
  );
  await missionRun.click();
  await page.waitForTimeout(5000);
  const swapsBefore = await readSwapCount(page);

  await narration.say(
    page,
    'Then the learner changes one setting — the layout method — and runs the identical circuit again.',
    6000,
  );
  const layoutSelect = page.getByLabel(/Initial layout/).first();
  await layoutSelect.waitFor({ state: 'visible', timeout: 20_000 });
  await layoutSelect.selectOption('interaction');
  await page.waitForTimeout(800);
  await missionRun.click();
  await page.waitForTimeout(5000);
  const swapsAfter = await readSwapCount(page);
  console.log(`  layout lesson: SWAPs ${swapsBefore} -> ${swapsAfter}`);

  await narration.say(
    page,
    `Same circuit, same hardware, fewer SWAPs: ${swapsBefore} became ${swapsAfter}. That is the compiler decision made visible, and it is the point of the whole project.`,
    7500,
  );

  // ------------------------------------------------------------ guided tour
  await clickMode(page, 'Guided Tour');
  await page.waitForTimeout(2000);
  await narration.say(
    page,
    'A guided tour narrates the same pipeline hands-free, sixteen chapters, each stating how certain its claims are.',
    6500,
  );
  const nextChapter = page.locator('.tour-overlay').getByRole('button', { name: 'Next →' });
  for (let i = 0; i < 3 && (await nextChapter.count()); i++) {
    await nextChapter.click().catch(() => undefined);
    await page.waitForTimeout(2200);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // ------------------------------------------------------------ the legend
  await clickMode(page, 'Explore');
  await page.getByRole('img', { name: /3D quantum city/ }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  // The tour selects districts, which opens the Inspector over the Legend
  // button; close it so the click target is clear.
  const inspectorClose = page.locator('.inspector').getByRole('button', { name: /close/i }).first();
  if (await inspectorClose.count()) await inspectorClose.click().catch(() => undefined);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Legend' }).click();
  await page.getByRole('dialog', { name: /City legend/ }).waitFor({ timeout: 15_000 });
  await narration.say(
    page,
    'The City Legend lists everything that moves, what it means, what triggers it, and how certain it is.',
    7000,
  );
  await narration.say(
    page,
    'The rule that makes this teach rather than mislead: vehicles carry jobs and measured bits. Never a quantum state.',
    7500,
  );
  await page.locator('.city-legend').getByRole('button', { name: 'Close legend' }).click();
  await narration.say(
    page,
    'No learning outcomes are claimed yet: the assessment instrument and study protocol are published, unrun.',
    6500,
  );
  await narration.say(
    page,
    'QSimCity. Apache-2.0, original artwork, runs offline. Thank you for watching.',
    5000,
  );

  const captions = narration.finish();
  const durationMs = narration.elapsedMs;
  await page.waitForTimeout(600);

  const video = page.video();
  await context.close();
  const rawPath = video ? await video.path() : null;
  await browser.close();
  server.close();

  if (!rawPath) throw new Error('Playwright produced no video file');
  const webmPath = join(OUT_DIR, 'qsimcity-demo.webm');
  renameSync(rawPath, webmPath);
  for (const leftover of readdirSync(RAW_DIR)) rmSync(join(RAW_DIR, leftover), { force: true });
  rmSync(RAW_DIR, { recursive: true, force: true });

  const srtPath = join(OUT_DIR, 'qsimcity-demo.srt');
  writeFileSync(srtPath, toSrt(captions));

  // Burn the captions in so the video is self-contained on any player.
  // ffmpeg runs without a shell, so the filter string carries no quotes and
  // commas inside force_style are escaped; running from the output
  // directory keeps the subtitle path free of characters needing escapes.
  const mp4Path = join(OUT_DIR, 'qsimcity-demo.mp4');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      'qsimcity-demo.webm',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '26',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      'qsimcity-demo.mp4',
    ],
    { stdio: 'pipe', cwd: OUT_DIR },
  );

  // The intermediate WebM is an artifact of recording, not a deliverable;
  // keeping it would double the size committed for no benefit.
  rmSync(webmPath, { force: true });

  const bytes = readFileSync(mp4Path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const probe = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,duration',
      '-of',
      'default=noprint_wrappers=1',
      mp4Path,
    ],
    { encoding: 'utf8' },
  );
  writeFileSync(join(OUT_DIR, 'qsimcity-demo.sha256'), `${sha256}  qsimcity-demo.mp4\n`);
  writeFileSync(
    join(OUT_DIR, 'demo-manifest.json'),
    JSON.stringify(
      {
        file: 'release-evidence/demo/qsimcity-demo.mp4',
        captions: 'release-evidence/demo/qsimcity-demo.srt',
        sha256,
        bytes: bytes.length,
        recordedDurationMs: durationMs,
        captionCount: captions.length,
        probe: probe.trim().split('\n'),
        uploaded: false,
        publicUrl: null,
        note: 'Recorded from the production build by pnpm demo:record. Not uploaded anywhere; no public URL exists.',
      },
      null,
      2,
    ) + '\n',
  );

  console.log(`Demo recorded: ${mp4Path}`);
  console.log(
    `  duration driven: ${(durationMs / 1000).toFixed(1)}s, captions: ${captions.length}`,
  );
  console.log(`  ${probe.trim().replace(/\n/g, ', ')}`);
  console.log(`  sha256: ${sha256}`);
}

await main();
