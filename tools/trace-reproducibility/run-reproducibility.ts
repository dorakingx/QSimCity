/**
 * Trace reproducibility evidence.
 *
 * The review asked for proof that the reproducibility claim survives the
 * separation of `semanticHash` from `artifactHash` — that keeping raw Qiskit
 * pass telemetry did not quietly make traces non-reproducible, and that
 * determinism was not manufactured by deleting the nondeterministic data.
 *
 * Three independent claims are measured here:
 *
 *   1. **Cross-process**: N fully separate Node processes each build a trace
 *      from the same circuit and seed and print its semantic hash. All N must
 *      agree, and they must keep agreeing when the seed changes (a hash that
 *      ignores the seed would also be "stable").
 *   2. **Cross-language**: the committed `examples/traces/*.qsimcity.json`
 *      were produced by the Python bridge; TypeScript recomputes both hashes
 *      from the bytes on disk and must reproduce the Python manifest exactly.
 *   3. **Telemetry independence**: mutating the recorded transpiler telemetry
 *      of a committed trace must leave the semantic hash unchanged while
 *      changing the artifact hash — the telemetry is preserved and excluded,
 *      not deleted.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseTraceJson, semanticHash, artifactHash, type Trace } from 'qsimcity-trace';
import { writeEvidence, hashString } from '../evidence.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const WORKER = 'tools/trace-reproducibility/hash-one-run.ts';
const TRACES_DIR = join(ROOT, 'examples', 'traces');

const CRITERIA = {
  minIndependentProcesses: 12,
  requiredDistinctSemanticHashes: 1,
  minSamplesVerified: 5,
} as const;

/** Sample id and seed for each independent process. */
const RUNS: readonly { readonly sample: string; readonly seed: string }[] = [
  ...Array.from({ length: 6 }, () => ({
    sample: 'bell',
    seed: 'evidence-seed-1',
  })),
  ...Array.from({ length: 3 }, () => ({
    sample: 'ghz-4',
    seed: 'evidence-seed-1',
  })),
  ...Array.from({ length: 3 }, () => ({
    sample: 'grover-2',
    seed: 'evidence-seed-1',
  })),
];

/** A second seed for the same circuit: the hash must track the seed. */
const SEED_SENSITIVITY: readonly {
  readonly sample: string;
  readonly seed: string;
}[] = [
  { sample: 'bell', seed: 'evidence-seed-2' },
  { sample: 'bell', seed: 'evidence-seed-3' },
];

function runWorker(sample: string, seed: string): string {
  return execFileSync(
    'pnpm',
    ['exec', 'tsx', '--tsconfig', 'tsconfig.typecheck.json', WORKER, sample, seed],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ).trim();
}

interface SampleCheck {
  readonly name: string;
  readonly semanticMatches: boolean;
  readonly artifactMatches: boolean;
}

function verifyCommittedSamples(): {
  checks: SampleCheck[];
  telemetryChecked: number;
} {
  const manifest = JSON.parse(readFileSync(join(TRACES_DIR, 'manifest.json'), 'utf8')) as Record<
    string,
    { semanticHash: string; artifactHash: string }
  >;
  const files = readdirSync(TRACES_DIR).filter((f) => f.endsWith('.qsimcity.json'));
  const checks: SampleCheck[] = [];
  let telemetryChecked = 0;

  for (const file of files) {
    const name = file.replace('.qsimcity.json', '');
    const expected = manifest[name];
    if (expected === undefined) {
      throw new Error(`${file} has no entry in the Python-generated manifest`);
    }
    const serialized = readFileSync(join(TRACES_DIR, file), 'utf8');
    const trace = parseTraceJson(serialized);
    checks.push({
      name,
      semanticMatches: semanticHash(trace) === expected.semanticHash,
      artifactMatches: artifactHash(serialized) === expected.artifactHash,
    });

    // Telemetry independence, on a real committed artifact.
    if (trace.telemetry?.executedPasses !== undefined) {
      const mutated: Trace = {
        ...trace,
        telemetry: {
          ...trace.telemetry,
          executedPasses: [...trace.telemetry.executedPasses, 'SyntheticPassThatNeverRan'],
        },
      };
      if (semanticHash(mutated) !== semanticHash(trace)) {
        throw new Error(`${name}: transpiler telemetry leaks into the semantic hash`);
      }
      if (artifactHash(JSON.stringify(mutated)) === artifactHash(JSON.stringify(trace))) {
        throw new Error(`${name}: artifact hash ignores a telemetry change`);
      }
      telemetryChecked += 1;
    }
  }
  return { checks, telemetryChecked };
}

function main(): void {
  process.stdout.write('Trace reproducibility\n');

  const observed: string[] = [];
  for (const [index, run] of RUNS.entries()) {
    const hash = runWorker(run.sample, run.seed);
    observed.push(`${run.sample}:${hash}`);
    process.stdout.write(`  process ${index + 1}/${RUNS.length} ${run.sample} ${hash}\n`);
  }
  // Group by circuit: each circuit must produce exactly one semantic hash.
  const perCircuit = new Map<string, Set<string>>();
  for (const entry of observed) {
    const [sample = '', hash = ''] = entry.split(':');
    const set = perCircuit.get(sample) ?? new Set<string>();
    set.add(hash);
    perCircuit.set(sample, set);
  }
  const distinctPerCircuit = [...perCircuit.values()].map((s) => s.size);
  const distinctSemanticHashes = Math.max(...distinctPerCircuit);

  const bellHash = [...(perCircuit.get('bell') ?? new Set<string>())][0] ?? '';
  const seedSensitive = SEED_SENSITIVITY.every(
    (run) => runWorker(run.sample, run.seed) !== bellHash,
  );
  process.stdout.write(
    `  seed sensitivity: ${seedSensitive ? 'the hash tracks the seed' : 'FAILED'}\n`,
  );

  const { checks, telemetryChecked } = verifyCommittedSamples();
  const samplesVerified = checks.filter((c) => c.semanticMatches && c.artifactMatches).length;
  process.stdout.write(
    `  committed samples: ${samplesVerified}/${checks.length} reproduce the Python manifest ` +
      `(${telemetryChecked} carry transpiler telemetry)\n`,
  );

  const passed =
    RUNS.length >= CRITERIA.minIndependentProcesses &&
    distinctSemanticHashes === CRITERIA.requiredDistinctSemanticHashes &&
    seedSensitive &&
    samplesVerified >= CRITERIA.minSamplesVerified &&
    samplesVerified === checks.length &&
    telemetryChecked > 0;

  writeEvidence('release-evidence/trace-reproducibility/reproducibility.json', {
    tool: 'qsimcity-trace-reproducibility',
    toolVersion: process.version,
    command: `${RUNS.length} independent \`tsx ${WORKER}\` processes + committed-sample verification`,
    exitStatus: passed ? 0 : 1,
    inputHash: hashString(readFileSync(join(TRACES_DIR, 'manifest.json'), 'utf8')),
    thresholds: CRITERIA,
    measurements: {
      independentProcesses: RUNS.length,
      distinctSemanticHashes,
      circuitsCovered: perCircuit.size,
      seedSensitive,
      samplesVerified,
      samplesTotal: checks.length,
      telemetryBearingSamplesChecked: telemetryChecked,
    },
    passed,
    detail: {
      perCircuitHashes: Object.fromEntries([...perCircuit.entries()].map(([k, v]) => [k, [...v]])),
      sampleChecks: checks,
    },
  });

  if (!passed) {
    process.stderr.write('Trace reproducibility FAILED\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('Trace reproducibility PASSED\n');
}

main();
