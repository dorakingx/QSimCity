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
 * One value is deliberately absent from every block that lands in a
 * tree-hashed file: the source-tree hash itself. Writing it into the README
 * changes the README, which changes the tree, which changes the hash — a
 * loop with no fixed point, where evidence and documentation could never
 * both be current. It lives in `release-evidence/summary.md`, which sits
 * outside the hashed tree and can name the tree freely.
 */

export type BlockName = keyof typeof BLOCKS;

const pct = (value: string): string => `${value}%`;

export const BLOCKS = {
  /** Headline evidence table, used by the README. */
  'evidence-table': (f: DocsFacts): string =>
    [
      '| What | Measured |',
      '| --- | --- |',
      `| Definition-of-Done gate | **${f.goalChecksPassed} passed, ${f.goalChecksFailed} failed** |`,
      `| Tests | ${f.unitTests} unit and integration, ${f.e2eTests} end-to-end |`,
      `| Agreement with Qiskit Aer | ${f.pytestPassed} pytest against Qiskit ${f.qiskitVersion} / Aer ${f.aerVersion} |`,
      `| Coverage | ${pct(f.coverageLines)} lines, ${pct(f.coverageBranches)} branches |`,
      `| Mutation score | ${f.mutationScore} (${f.mutantsKilled} of ${f.mutantsGenerated} killed, ${f.mutantsSurvived} reviewed equivalent) |`,
      `| Trace reproducibility | ${f.reproProcesses} independent processes, ${f.reproDistinctSemanticHashes} distinct \`semanticHash\` |`,
      `| Ten-minute soak | ${f.soakSeconds}s, ${f.soakCycles} cycles, ${f.soakConsoleErrors} console errors |`,
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
      `- Definition-of-Done gate: **${f.goalChecksPassed} passed, ${f.goalChecksFailed} failed**.`,
      `- ${f.unitTests} unit and integration tests, ${f.e2eTests} end-to-end tests.`,
      `- ${f.pytestPassed} pytest cases agreeing with Qiskit ${f.qiskitVersion} / Aer ${f.aerVersion}.`,
      `- Coverage ${pct(f.coverageLines)} lines, ${pct(f.coverageBranches)} branches; mutation score ${f.mutationScore}.`,
      `- ${f.reproProcesses} independent processes produced ${f.reproDistinctSemanticHashes} distinct \`semanticHash\` per sample.`,
      `- Ten-minute soak: ${f.soakSeconds}s, ${f.soakCycles} cycles, ${f.soakConsoleErrors} console errors.`,
      `- ${f.remountCycles} 3D/2D remount cycles leave ${f.remountPeakContexts} WebGL contexts behind.`,
      `- ${f.initialJsKib} KiB gzip initial JS (${f.totalJsKib} KiB total).`,
      `- Clean clone: ${f.freshCloneSteps} of ${f.freshCloneSteps} verification steps, ${f.freshCloneFailed} failed.`,
    ].join('\n'),

  /** Demo video facts, including the checksum that must match the file. */
  'demo-facts': (f: DocsFacts): string => {
    const minutes = Math.floor(f.demoSeconds / 60);
    const seconds = String(f.demoSeconds % 60).padStart(2, '0');
    return [
      `- **File**: [\`release-evidence/demo/qsimcity-demo.mp4\`](release-evidence/demo/qsimcity-demo.mp4) — 1920x1080, H.264, ${minutes} min ${seconds} s, no audio.`,
      `- **Captions**: ${f.demoCaptions}, drawn into the page as it recorded, plus [an SRT sidecar](release-evidence/demo/qsimcity-demo.srt).`,
      `- **SHA-256**: \`${f.demoSha256}\``,
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
