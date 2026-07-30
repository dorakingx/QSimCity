import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXCLUSIONS, OPERATORS, SCOPE_AREAS, type ScopeArea } from './scope.js';
import { hashString, writeEvidence } from '../evidence.js';

/**
 * Scientific mutation testing (spec §18.4).
 *
 * Mutants are generated from operator rules applied to every file in the
 * declared scientific scope, rather than hand-picked. Each mutant is applied
 * to a working copy of the source, the tests covering that area are run, and
 * the mutant counts as killed when they fail.
 *
 * Determinism: candidate sites are enumerated in file order and sampled with
 * a fixed stride, so the same commit always produces the same mutant set.
 */

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'release-evidence', 'mutation');
const THRESHOLD = Number(process.env['MUTATION_THRESHOLD'] ?? '0.7');
/** Mutants generated per file; keeps a full run tractable while covering every file. */
const MUTANTS_PER_FILE = Number(process.env['MUTANTS_PER_FILE'] ?? '6');

interface Mutant {
  readonly id: string;
  readonly area: string;
  readonly capability: string;
  readonly file: string;
  readonly operator: string;
  readonly line: number;
  readonly original: string;
  readonly mutated: string;
  readonly index: number;
  readonly tests: readonly string[];
}

interface MutantOutcome extends Mutant {
  readonly killed: boolean;
  readonly durationMs: number;
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (content[i] === '\n') line++;
  return line;
}

/** True for regions where a mutation would not change behavior. */
function isInInertRegion(content: string, index: number): boolean {
  const before = content.slice(0, index);
  const lineStart = before.lastIndexOf('\n') + 1;
  const line = content.slice(lineStart, content.indexOf('\n', index));
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return true;
  // Inside a block comment.
  const lastOpen = before.lastIndexOf('/*');
  const lastClose = before.lastIndexOf('*/');
  if (lastOpen > lastClose) return true;
  // Import/export statements and type-only lines carry no runtime behavior.
  if (/^(import|export type|export \*|export \{)/.test(trimmed)) return true;
  // Trailing line comments: mutating them changes nothing but is reported as
  // a survivor, which would overstate the number of unguarded code paths.
  const lineOffset = index - lineStart;
  const commentStart = line.indexOf('//');
  if (commentStart !== -1 && lineOffset > commentStart) {
    // Ignore `//` inside a string literal on the same line.
    const beforeComment = line.slice(0, commentStart);
    const quotes = (beforeComment.match(/['"`]/g) ?? []).length;
    if (quotes % 2 === 0) return true;
  }
  return false;
}

function generateMutants(area: ScopeArea): Mutant[] {
  const mutants: Mutant[] = [];
  for (const file of area.files) {
    const content = readFileSync(join(ROOT, file), 'utf8');
    // `index` must be the position within THIS operator's own candidate list,
    // because applyMutant re-scans one operator at a time. Indexing across a
    // combined list would make the applier mutate a different site than the
    // one described, producing misleading evidence.
    const candidates: Omit<Mutant, 'id'>[] = [];
    for (const operator of OPERATORS) {
      const regex = new RegExp(operator.pattern.source, operator.pattern.flags);
      let match: RegExpExecArray | null;
      let operatorIndex = 0;
      while ((match = regex.exec(content)) !== null) {
        if (isInInertRegion(content, match.index)) continue;
        const replacement = operator.replace(match);
        if (replacement === null || replacement === match[0]) continue;
        candidates.push({
          area: area.id,
          capability: area.capability,
          file,
          operator: operator.id,
          line: lineOf(content, match.index),
          original: match[0],
          mutated: replacement,
          tests: area.tests,
          index: operatorIndex,
        });
        operatorIndex++;
      }
    }
    // Deterministic stride sampling spreads mutants across the whole file.
    const stride = Math.max(1, Math.floor(candidates.length / MUTANTS_PER_FILE));
    let taken = 0;
    for (let i = 0; i < candidates.length && taken < MUTANTS_PER_FILE; i += stride) {
      const candidate = candidates[i]!;
      mutants.push({
        ...candidate,
        id: `${area.id}:${candidate.file.split('/').pop()}:${candidate.line}:${candidate.operator}`,
      });
      taken++;
    }
  }
  return mutants;
}

/** Applies the nth occurrence of `original` matching the recorded position. */
function applyMutant(content: string, mutant: Mutant): string | null {
  const operator = OPERATORS.find((o) => o.id === mutant.operator)!;
  const regex = new RegExp(operator.pattern.source, operator.pattern.flags);
  let match: RegExpExecArray | null;
  let seen = 0;
  while ((match = regex.exec(content)) !== null) {
    if (isInInertRegion(content, match.index)) continue;
    const replacement = operator.replace(match);
    if (replacement === null || replacement === match[0]) continue;
    if (seen === mutant.index) {
      return content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
    }
    seen++;
  }
  return null;
}

function runTests(paths: readonly string[]): boolean {
  try {
    execFileSync(
      join(ROOT, 'node_modules', '.bin', 'vitest'),
      ['run', ...paths, '--coverage.enabled=false', '--silent'],
      { cwd: ROOT, stdio: 'pipe', timeout: 600_000 },
    );
    return true; // passed => mutant survived
  } catch {
    return false; // failed => mutant killed
  }
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const allMutants = SCOPE_AREAS.flatMap(generateMutants);
  console.log(
    `Generated ${allMutants.length} mutants across ${SCOPE_AREAS.length} capability areas ` +
      `and ${new Set(allMutants.map((m) => m.file)).size} files.\n`,
  );

  const outcomes: MutantOutcome[] = [];
  for (const [i, mutant] of allMutants.entries()) {
    const target = join(ROOT, mutant.file);
    const original = readFileSync(target, 'utf8');
    const mutatedSource = applyMutant(original, mutant);
    if (mutatedSource === null || mutatedSource === original) {
      console.log(`[${i + 1}/${allMutants.length}] SKIP (no site) ${mutant.id}`);
      continue;
    }
    const started = Date.now();
    try {
      writeFileSync(target, mutatedSource);
      const survived = runTests(mutant.tests);
      const outcome: MutantOutcome = {
        ...mutant,
        killed: !survived,
        durationMs: Date.now() - started,
      };
      outcomes.push(outcome);
      console.log(
        `[${i + 1}/${allMutants.length}] ${outcome.killed ? 'KILLED  ' : 'SURVIVED'} ` +
          `${mutant.file}:${mutant.line} ${mutant.operator} (${mutant.original} -> ${mutant.mutated})`,
      );
    } finally {
      writeFileSync(target, original);
    }
  }

  const killed = outcomes.filter((o) => o.killed);
  const survivors = outcomes.filter((o) => !o.killed);
  const score = outcomes.length > 0 ? killed.length / outcomes.length : 0;

  const byArea = SCOPE_AREAS.map((area) => {
    const areaOutcomes = outcomes.filter((o) => o.area === area.id);
    return {
      area: area.id,
      capability: area.capability,
      files: area.files,
      generated: areaOutcomes.length,
      killed: areaOutcomes.filter((o) => o.killed).length,
      score:
        areaOutcomes.length > 0
          ? areaOutcomes.filter((o) => o.killed).length / areaOutcomes.length
          : null,
    };
  });

  writeFileSync(
    join(OUT_DIR, 'scope-manifest.json'),
    JSON.stringify(
      {
        areas: SCOPE_AREAS.map((a) => ({
          id: a.id,
          capability: a.capability,
          files: a.files,
          tests: a.tests,
        })),
        exclusions: EXCLUSIONS,
        operators: OPERATORS.map((o) => ({ id: o.id, description: o.description })),
        mutantsPerFile: MUTANTS_PER_FILE,
        filesInScope: [...new Set(SCOPE_AREAS.flatMap((a) => a.files))].sort(),
      },
      null,
      2,
    ) + '\n',
  );

  writeFileSync(
    join(OUT_DIR, 'survivor-review.md'),
    `# Mutation Survivors\n\n` +
      (survivors.length === 0
        ? 'No mutants survived.\n'
        : `${survivors.length} mutant(s) survived. Each must be killed by a new test or\n` +
          `justified as equivalent or unreachable.\n\n` +
          survivors
            .map(
              (s) =>
                `## \`${s.file}:${s.line}\` — ${s.operator}\n\n` +
                `- Capability: ${s.capability}\n` +
                `- Mutation: \`${s.original}\` → \`${s.mutated}\`\n` +
                `- Tests run: ${s.tests.join(', ')}\n` +
                `- Review: **pending**\n`,
            )
            .join('\n')) +
      '\n',
  );

  writeEvidence('release-evidence/mutation/mutation-report.json', {
    tool: 'qsimcity-mutation',
    toolVersion: '2.0.0',
    command: 'pnpm test:mutation',
    exitStatus: score >= THRESHOLD ? 0 : 1,
    inputHash: hashString(JSON.stringify(SCOPE_AREAS) + MUTANTS_PER_FILE),
    thresholds: { score: THRESHOLD },
    measurements: {
      score: Number(score.toFixed(4)),
      generated: outcomes.length,
      killed: killed.length,
      survived: survivors.length,
      areas: SCOPE_AREAS.length,
      filesInScope: new Set(SCOPE_AREAS.flatMap((a) => a.files)).size,
    },
    passed: score >= THRESHOLD,
    detail: { byArea, survivors, outcomes },
  });

  console.log(`\nMutation score: ${(score * 100).toFixed(1)}% (${killed.length}/${outcomes.length})`);
  console.log('Per capability area:');
  for (const a of byArea) {
    console.log(
      `  ${a.area.padEnd(28)} ${a.killed}/${a.generated}` +
        (a.score !== null ? ` (${(a.score * 100).toFixed(0)}%)` : ''),
    );
  }
  if (score < THRESHOLD) {
    console.error(`\nBelow threshold ${(THRESHOLD * 100).toFixed(0)}%.`);
    process.exit(1);
  }
}

main();
