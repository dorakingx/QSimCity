import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The central pedagogical claim, enforced over every learner-visible string.
 *
 * README and the WISER submission both state that vehicles and people carry
 * instructions, jobs or measured bits — "never amplitudes or quantum
 * states" — and that the transport misconception is designed against
 * because it is the one this metaphor could plausibly install. The
 * evaluation plan nominates exactly that misconception as the
 * disqualifying probe response.
 *
 * The previous guard checked the `represents` field of three legend entries
 * by hand-written id list. It could not see the string that actually
 * shipped: a district description reading "SWAP cars shuttle quantum
 * information between platforms", rendered in the Inspector at every
 * explanation level including child, in both 3D and Accessible 2D. A spot
 * check presented as a rule is worse than no rule, because it is quoted as
 * one.
 *
 * This scans the content sources a learner can actually read and fails on
 * any phrasing that puts quantum state, amplitudes or "quantum information"
 * in motion along the city — regardless of which file or field it hides in.
 */

const CONTENT_ROOTS = [
  'packages/world/src/districts.ts',
  'packages/world/src/interiors.ts',
  'packages/world/src/interactives.ts',
  'packages/world/src/landmarks.ts',
  'packages/ui/src/content',
  'packages/ui/src/missions',
  'packages/ui/src/tour',
  'packages/ui/src/scenarios',
];

/**
 * Verbs that put something in motion. Paired with a quantum noun below,
 * these are the sentences that teach "the state travels down the road".
 */
const MOTION = String.raw`travel(?:s|ling|ing)?|mov(?:e|es|ing)|shuttl(?:e|es|ing)|carr(?:y|ies|ying)|ferr(?:y|ies|ying)|ride(?:s)?|riding|haul(?:s|ing)?|deliver(?:s|ing)?|transport(?:s|ing)?|flow(?:s|ing)?|drive(?:s)?|driving|sent|sends|sending`;

/** Nouns that must never be the thing in motion. */
const QUANTUM = String.raw`quantum state(?:s)?|quantum information|amplitude(?:s)?|wave ?function(?:s)?|superposition(?:s)?|the state`;

const FORBIDDEN: readonly RegExp[] = [
  // "... carries the quantum state ..." (noun after verb)
  new RegExp(String.raw`\b(?:${MOTION})\b[^.!?]{0,40}\b(?:${QUANTUM})\b`, 'i'),
  // "... the quantum state travels ..." (noun before verb)
  new RegExp(String.raw`\b(?:${QUANTUM})\b[^.!?]{0,40}\b(?:${MOTION})\b`, 'i'),
];

/**
 * Sentences that exist precisely to deny the misconception. They contain
 * the same words and must not be flagged.
 *
 * Known limitation, stated rather than hidden: this exempts the whole
 * string, so a long passage that denies the misconception in one clause
 * and teaches it in another would pass. The guard is a net for the common
 * case, not a proof. It has already caught two real shipped strings that
 * a hand-maintained id list missed, which is the bar it needs to clear.
 */
const DENIAL = /\bnever\b|\bnothing\b|\bnot\b|\bno\b|\bcannot\b|\brather than\b|\binstead of\b/i;

function sourceFiles(rootRelative: string): string[] {
  const root = resolve(process.cwd(), rootRelative);
  const fallback = resolve(process.cwd(), '..', '..', rootRelative);
  const base = existsSync(root) ? root : fallback;
  if (!existsSync(base)) return [];
  if (statSync(base).isFile()) return [base];
  const out: string[] = [];
  for (const entry of readdirSync(base)) {
    const full = join(base, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(join(rootRelative, entry)));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** Every quoted string literal in a source file, with its line number. */
function stringLiterals(text: string): { line: number; value: string }[] {
  const out: { line: number; value: string }[] = [];
  text.split('\n').forEach((lineText, i) => {
    // Skip comments: prose about the rule is not a violation of it.
    const trimmed = lineText.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    for (const match of lineText.matchAll(/'([^']{12,})'|"([^"]{12,})"|`([^`]{12,})`/g)) {
      out.push({ line: i + 1, value: match[1] ?? match[2] ?? match[3] ?? '' });
    }
  });
  return out;
}

describe('the transport misconception is designed against, everywhere', () => {
  const files = CONTENT_ROOTS.flatMap(sourceFiles);

  it('finds the learner-visible content sources', () => {
    expect(files.length, 'no content sources located').toBeGreaterThan(5);
  });

  it('never puts quantum state, amplitudes or quantum information in motion', () => {
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const { line, value } of stringLiterals(text)) {
        if (DENIAL.test(value)) continue;
        if (FORBIDDEN.some((pattern) => pattern.test(value))) {
          violations.push(`${file.split('/').slice(-2).join('/')}:${line}: ${value.slice(0, 140)}`);
        }
      }
    }
    expect(
      violations,
      `strings that teach the transport misconception:\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
