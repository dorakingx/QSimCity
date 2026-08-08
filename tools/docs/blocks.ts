import type { DocsFacts } from './facts.js';

/**
 * The generated regions of the documentation, and what goes in them.
 *
 * A block is delimited in the markdown by
 *
 *     <!-- docs:sync start:NAME -->
 *     ...generated...
 *     <!-- docs:sync end:NAME -->
 *
 * `pnpm docs:sync` rewrites the inside; `pnpm docs:check` re-renders and
 * fails if what is committed differs. That is the whole mechanism: a number
 * in one of these regions cannot be edited by hand and survive, and it
 * cannot go stale while evidence moves, because both operations read the
 * same facts.
 *
 * Prose outside the markers stays hand-written on purpose. The goal is not
 * to generate the documentation — it is to stop the *claims* drifting away
 * from the measurements while the writing stays human.
 *
 * One rule governs what may appear in a block that lands in a tree-hashed
 * file: nothing that changes unless the tree does. That rules out two
 * families of value.
 *
 * The first is anything produced *after* the tree closes. The source-tree hash, the
 * demo video's checksum and the gate's own pass count are all computed from
 * or after the finished tree, so writing any of them into the README
 * changes the README, changes the tree, and changes the value again — a
 * loop with no fixed point, in which evidence and documentation could never
 * both be current at once.
 *
 * Each of those lives beside the artifact it describes under
 * `release-evidence/`, which sits outside the hashed tree and can carry
 * values that move with it. The documents point at them instead of copying
 * them, and `release-evidence/summary.md` — also outside the tree — states
 * all three.
 *
 * The second is anything that varies between runs of the same tree. The
 * soak's elapsed seconds and cycle count, and the demo's duration to the
 * second, differ a little every time — 601.6 s one run, 601.0 s the next —
 * so quoting them here meant every regeneration rewrote the README and
 * invalidated the evidence that had just been produced. Those become the
 * outcome that is actually being asserted: zero errors, zero uncaught,
 * zero failed requests. The exact figures stay in the envelope and in
 * `release-evidence/summary.md`.
 *
 * What remains in the blocks are measurements that are a deterministic
 * function of the tree: coverage, mutation score, test counts, bundle
 * bytes, Qiskit agreement, reproducibility, remount cycles and contexts.
 */

export type BlockName = keyof typeof BLOCKS;

/**
 * Where the recording is published.
 *
 * A constant rather than a measurement: it does not vary per run and is not
 * produced after the tree closes, so it is safe inside a block that lands in
 * a tree-hashed document. Unlisted, so it is reachable by link without being
 * listed or searchable on the platform.
 */
const DEMO_VIDEO_URL = 'https://youtu.be/I05IFasLJWY';

const pct = (value: string): string => `${value}%`;

export const BLOCKS = {
  /** Headline evidence table, used by the README. */
  'evidence-table': (f: DocsFacts): string =>
    [
      '| What | Measured |',
      '| --- | --- |',
      '| Definition-of-Done gate | every check passing — see [`goal-check.txt`](release-evidence/goal-check.txt) |',
      `| Tests | ${f.unitTests} unit and integration, ${f.e2eTests} end-to-end |`,
      `| Agreement with Qiskit Aer | ${f.pytestPassed} pytest against Qiskit ${f.qiskitVersion} / Aer ${f.aerVersion} |`,
      `| Coverage | ${pct(f.coverageLines)} lines, ${pct(f.coverageBranches)} branches |`,
      `| Mutation score | ${f.mutationScore} (${f.mutantsKilled} of ${f.mutantsGenerated} killed, ${f.mutantsSurvived} reviewed equivalent) |`,
      `| Trace reproducibility | ${f.reproProcesses} independent processes, ${f.reproDistinctSemanticHashes} distinct \`semanticHash\` |`,
      `| Ten-minute soak | ${f.soakConsoleErrors} console errors, ${f.soakUncaughtErrors} uncaught, ${f.soakFailedRequests} failed requests |`,
      `| 3D/2D remount | ${f.remountCycles} cycles, ${f.remountPeakContexts} WebGL contexts left behind |`,
      `| Initial JS | ${f.initialJsKib} KiB gzip (${f.totalJsKib} KiB total) |`,
      `| Clean-clone reproduction | ${f.freshCloneSteps} of ${f.freshCloneSteps} steps, ${f.freshCloneFailed} failed |`,
      '',
      'Every row is bound to an evidence envelope under',
      '[`release-evidence/`](release-evidence/) that records the source tree it measured;',
      '`pnpm goal:check` recomputes the verdicts and rejects any envelope whose tree hash',
      'no longer matches. The tree itself is named in',
      '[`release-evidence/summary.md`](release-evidence/summary.md).',
    ].join('\n'),

  /** The same numbers in prose form, for the WISER submission. */
  'evidence-list': (f: DocsFacts): string =>
    [
      '- Definition-of-Done gate: every check passing; the full transcript is `release-evidence/goal-check.txt`.',
      `- ${f.unitTests} unit and integration tests, ${f.e2eTests} end-to-end tests.`,
      `- ${f.pytestPassed} pytest cases agreeing with Qiskit ${f.qiskitVersion} / Aer ${f.aerVersion}.`,
      `- Coverage ${pct(f.coverageLines)} lines, ${pct(f.coverageBranches)} branches; mutation score ${f.mutationScore}.`,
      `- ${f.reproProcesses} independent processes produced ${f.reproDistinctSemanticHashes} distinct \`semanticHash\` per sample.`,
      `- Ten-minute soak: ${f.soakConsoleErrors} console errors, ${f.soakUncaughtErrors} uncaught, ${f.soakFailedRequests} failed requests.`,
      `- ${f.remountCycles} 3D/2D remount cycles leave ${f.remountPeakContexts} WebGL contexts behind.`,
      `- ${f.initialJsKib} KiB gzip initial JS (${f.totalJsKib} KiB total).`,
      `- Clean clone: ${f.freshCloneSteps} of ${f.freshCloneSteps} verification steps, ${f.freshCloneFailed} failed.`,
    ].join('\n'),

  /** Demo video facts, including the checksum that must match the file. */
  'demo-facts': (f: DocsFacts): string => {
    return [
      `- **Watch it**: <${DEMO_VIDEO_URL}> — 1920x1080, just over five minutes, no audio (the narration is on-screen captions). Unlisted, so the link reaches it without it being listed on the platform.`,
      '- **The same file, in this repository**: [`release-evidence/demo/qsimcity-demo.mp4`](release-evidence/demo/qsimcity-demo.mp4) — H.264, recorded from the production build.',
      `- **Captions**: ${f.demoCaptions}, drawn into the page as it recorded, plus [an SRT sidecar](release-evidence/demo/qsimcity-demo.srt).`,
      '- **SHA-256**: in [`qsimcity-demo.sha256`](release-evidence/demo/qsimcity-demo.sha256), beside the file.',
      '- **Bound to** the source tree it depicts; `pnpm goal:check` rejects the recording once that tree moves.',
    ].join('\n');
  },

  /** One-line version statement, canonical across the repository. */
  'product-version': (f: DocsFacts): string => `QSimCity **v${f.productVersion}**`,
} as const satisfies Record<string, (facts: DocsFacts) => string>;

const START = (name: string): string => `<!-- docs:sync start:${name} -->`;
const END = (name: string): string => `<!-- docs:sync end:${name} -->`;

export interface BlockOccurrence {
  readonly name: string;
  readonly current: string;
  readonly expected: string;
}

/**
 * The body between a block's markers, however much of it there is.
 *
 * Deliberately tolerant of an empty block. The first version of this
 * required a newline on each side of the body, so a freshly written
 * `start` immediately followed by `end` matched nothing at all: `sync`
 * skipped it and `check` found no block to compare, and an empty evidence
 * table passed the gate in silence. An unfilled block is the exact failure
 * this mechanism exists to catch, so it must not be able to hide by being
 * empty. `requiredBlocks` below closes the other half of the hole.
 */
const blockPattern = (name: string): RegExp =>
  new RegExp(`${escape(START(name))}([\\s\\S]*?)${escape(END(name))}`, 'g');

/** Every generated block found in `text`, with current and expected bodies. */
export function findBlocks(text: string, facts: DocsFacts): BlockOccurrence[] {
  const found: BlockOccurrence[] = [];
  for (const name of Object.keys(BLOCKS)) {
    for (const match of text.matchAll(blockPattern(name))) {
      found.push({
        name,
        current: (match[1] ?? '').trim(),
        expected: BLOCKS[name as BlockName](facts).trim(),
      });
    }
  }
  return found;
}

/** Rewrites every generated block in `text`; leaves everything else alone. */
export function applyBlocks(text: string, facts: DocsFacts): string {
  let output = text;
  for (const name of Object.keys(BLOCKS)) {
    output = output.replace(
      blockPattern(name),
      `${START(name)}\n${BLOCKS[name as BlockName](facts)}\n${END(name)}`,
    );
  }
  return output;
}

/** Block names present in `text`, whether or not they have any body. */
export function presentBlockNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/<!-- docs:sync start:([a-z0-9-]+) -->/g)) {
    names.add(match[1] ?? '');
  }
  return names;
}

/** Markers that name a block this tool does not know how to render. */
export function unknownBlockNames(text: string): string[] {
  const known = new Set(Object.keys(BLOCKS));
  const names = new Set<string>();
  for (const match of text.matchAll(/<!-- docs:sync start:([a-z0-9-]+) -->/g)) {
    const name = match[1] ?? '';
    if (!known.has(name)) names.add(name);
  }
  return [...names];
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `release-evidence/summary.md`, rendered in full.
 *
 * Lives here rather than in `sync.ts` so that `check.ts` can re-render it
 * and compare. A file that only one command knows how to produce is a file
 * that can drift silently — which is what the previous hand-written summary
 * did, describing version 1.0.0 and five artifacts when there were sixteen.
 *
 * Unlike the README blocks this may quote the source-tree hash, the gate
 * count and the demo checksum: `release-evidence/` is outside the hashed
 * tree, so recording them here changes nothing that they describe.
 */
export function renderSummary(facts: DocsFacts): string {
  const evidenceFiles: readonly { readonly path: string; readonly what: string }[] = [
    { path: 'coverage/per-package-coverage.json', what: 'Per-package line and branch coverage' },
    {
      path: 'mutation/mutation-report.json',
      what: 'Generative mutation testing of scientific invariants',
    },
    { path: 'python/python-verify.json', what: 'Qiskit bridge: pytest, pyright, ruff' },
    {
      path: 'trace-reproducibility/reproducibility.json',
      what: 'Cross-process and cross-language trace hashing',
    },
    { path: 'security/security-report.json', what: 'Dependency audit and policy scans' },
    { path: 'performance.json', what: 'Chunk-level byte budgets from the real build' },
    {
      path: 'lighthouse/lighthouse-report.json',
      what: 'Lighthouse across four targets, three runs each',
    },
    { path: 'visual-benchmark/benchmark.json', what: 'Visual quality rubric scoring' },
    { path: 'wiser-fps/fps-report.json', what: 'Frame-time percentiles, capped and uncapped' },
    { path: 'wiser-screenshots/manifest.json', what: 'The fifteen WISER surface captures' },
    { path: 'wiser-reviews/reviews.json', what: 'Separated adversarial review verdicts' },
    { path: 'remount/remount-report.json', what: 'Fixed-count 3D/2D remount safety' },
    { path: 'soak/soak-report.json', what: 'Ten-minute production soak' },
    { path: 'fresh-clone/fresh-clone.json', what: 'Verification inside a clean clone' },
    { path: 'demo/demo-manifest.json', what: 'Demo recording, bound to the source tree' },
    { path: 'goal-check.txt', what: 'Full output of pnpm goal:check' },
  ];

  const minutes = Math.floor(facts.demoSeconds / 60);
  const seconds = String(facts.demoSeconds % 60).padStart(2, '0');

  return [
    `# Release evidence — QSimCity ${facts.productVersion}`,
    '',
    '<!-- Generated by `pnpm docs:sync`. Do not edit by hand: the previous',
    '     hand-written summary still described version 1.0.0 and five',
    '     artifacts long after there were sixteen. -->',
    '',
    `Every measurement below was produced from source tree \`${facts.sourceTreeHash}\``,
    'by a command that exited zero, and recorded in an envelope that binds it to',
    'that tree. `pnpm goal:check` recomputes the verdicts and rejects any envelope',
    'whose tree hash no longer matches, so evidence cannot outlive the code it',
    'measured.',
    '',
    '## Results',
    '',
    '| What | Measured |',
    '| --- | --- |',
    `| Definition-of-Done gate | ${facts.goalChecksPassed} passed, ${facts.goalChecksFailed} failed |`,
    `| Unit and integration tests | ${facts.unitTests} |`,
    `| End-to-end tests | ${facts.e2eTests} |`,
    `| Qiskit agreement | ${facts.pytestPassed} pytest against Qiskit ${facts.qiskitVersion} / Aer ${facts.aerVersion} |`,
    `| Coverage | ${facts.coverageLines}% lines, ${facts.coverageBranches}% branches |`,
    `| Mutation score | ${facts.mutationScore} (${facts.mutantsKilled}/${facts.mutantsGenerated} killed, ${facts.mutantsSurvived} equivalent) |`,
    `| Trace reproducibility | ${facts.reproProcesses} processes, ${facts.reproDistinctSemanticHashes} distinct semanticHash |`,
    `| Ten-minute soak | ${facts.soakSeconds}s, ${facts.soakCycles} cycles, ${facts.soakConsoleErrors} console errors |`,
    `| 3D/2D remount | ${facts.remountCycles} cycles, ${facts.remountPeakContexts} WebGL contexts left behind |`,
    `| Initial JS | ${facts.initialJsKib} KiB gzip (${facts.totalJsKib} KiB total) |`,
    `| Clean clone | ${facts.freshCloneSteps} steps, ${facts.freshCloneFailed} failed |`,
    `| Demo recording | ${minutes} min ${seconds} s, ${facts.demoCaptions} captions |`,
    '',
    '## Deployment',
    '',
    'Production serves `main` at <https://qsimcity.vercel.app>. The deployment is',
    'bound to the merge commit through the GitHub deployments API, and the served',
    'bundle is the one built from this tree.',
    '',
    '## Artifacts in this directory',
    '',
    '| File | Contents |',
    '| --- | --- |',
    ...evidenceFiles.map(({ path, what }) => `| \`${path}\` | ${what} |`),
    '',
    '## What is not measured here',
    '',
    '- No human learning outcome. The assessment instrument and protocol are',
    '  published and unrun; the instrument itself needs revision first.',
    '- The adversarial reviews were performed by AI agents, not human experts.',
    '- Mobile frame times are Chromium emulation on a desktop GPU.',
    '',
  ].join('\n');
}
