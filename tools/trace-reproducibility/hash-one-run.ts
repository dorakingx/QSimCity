/**
 * Worker for the reproducibility harness: one independent process, one trace,
 * one semantic hash printed to stdout.
 *
 * Run as `tsx tools/trace-reproducibility/hash-one-run.ts <sample-id> <seed>`.
 * Nothing here reads shared state, so N concurrent copies constitute N
 * genuinely independent reproductions rather than N reads of one cached result.
 */
import { parseQasm, getSampleCircuit, getDevice } from '@qsimcity/domain';
import { compile } from '@qsimcity/reference-compiler';
import { runExperiment } from '@qsimcity/simulator';
import { semanticHash } from 'qsimcity-trace';

const sampleId = process.argv[2] ?? 'bell';
const seed = process.argv[3] ?? 'reproducibility-1';

const sample = getSampleCircuit(sampleId);
const circuit = parseQasm(sample.qasm);
const compiled = compile(circuit, { device: getDevice('linear-5') });
const { trace } = await runExperiment(compiled.compiled, {
  shots: 512,
  seed,
  noise: {
    readoutError: 0.02,
    depolarizing1q: 0.005,
    depolarizing2q: 0.02,
    amplitudeDamping: 0.01,
    phaseDamping: 0.01,
  },
  programSource: sample.qasm,
  deviceId: 'linear-5',
});

process.stdout.write(`${semanticHash(trace)}\n`);
