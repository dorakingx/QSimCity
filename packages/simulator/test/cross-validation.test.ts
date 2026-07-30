import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSampleCircuit, parseQasm, type Circuit, type Instruction, makeCircuit } from '@qsimcity/domain';
import { fnv1a64 } from 'qsimcity-trace';
import { simulate } from '../src/engine.js';
import {
  applyGate1,
  applyGate2,
  applyGate3,
  createState,
  indexToBitstring,
} from '../src/statevector.js';
import { gateDef } from '@qsimcity/domain';

/**
 * Scientific cross-validation (spec §18.3): the browser simulator is checked
 * against committed Qiskit reference results (Statevector + AerSimulator),
 * regenerated reproducibly by python/qsimcity_qiskit.
 */

interface CrossvalEntry {
  id: string;
  qasmHash: string;
  numQubits: number;
  statevector: [number, number][];
  idealCounts: Record<string, number>;
  shots: number;
  seed: number;
}

const ROOT = new URL('../../..', import.meta.url).pathname;
const reference = JSON.parse(
  readFileSync(join(ROOT, 'examples', 'cross-validation', 'qiskit-results.json'), 'utf8'),
) as { circuits: CrossvalEntry[]; packageVersions: Record<string, string> };

function stripMeasurements(circuit: Circuit): Circuit {
  return makeCircuit({
    name: circuit.name,
    numQubits: circuit.numQubits,
    cregs: circuit.cregs.map((r) => ({ name: r.name, size: r.size })),
    instructions: circuit.instructions.filter((i) => i.kind === 'gate') as Instruction[],
  });
}

function browserStatevector(circuit: Circuit): { re: Float64Array; im: Float64Array } {
  const state = createState(circuit.numQubits);
  for (const instr of circuit.instructions) {
    if (instr.kind !== 'gate') continue;
    const def = gateDef(instr.name);
    const m = def.matrix(instr.params);
    if (def.numQubits === 1) applyGate1(state, m, instr.qubits[0]!);
    else if (def.numQubits === 2) applyGate2(state, m, instr.qubits[0]!, instr.qubits[1]!);
    else applyGate3(state, m, instr.qubits[0]!, instr.qubits[1]!, instr.qubits[2]!);
  }
  return state;
}

/** Total variation distance between two distributions over bitstrings. */
function tvd(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let d = 0;
  for (const k of keys) d += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return d / 2;
}

function normalizeCounts(counts: Record<string, number>): Record<string, number> {
  const total = Object.values(counts).reduce((x, y) => x + y, 0);
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / total]));
}

describe('cross-validation against Qiskit reference results', () => {
  it('reference file was generated from the same sample circuits (hash check)', () => {
    for (const entry of reference.circuits) {
      const sample = getSampleCircuit(entry.id);
      expect(fnv1a64(sample.qasm), entry.id).toBe(entry.qasmHash);
    }
  });

  it('records the Qiskit version used for the reference', () => {
    expect(reference.packageVersions['qiskit']).toMatch(/^\d+\./);
  });

  for (const entry of reference.circuits) {
    describe(entry.id, () => {
      it('statevector matches Qiskit up to global phase (amplitude-wise)', () => {
        const circuit = stripMeasurements(parseQasm(getSampleCircuit(entry.id).qasm));
        const state = browserStatevector(circuit);
        const dim = 1 << entry.numQubits;
        expect(entry.statevector).toHaveLength(dim);
        // Fix the global phase using the largest-magnitude reference entry.
        let refIdx = 0;
        let best = 0;
        for (let i = 0; i < dim; i++) {
          const [re, im] = entry.statevector[i]!;
          const mag = re * re + im * im;
          if (mag > best) {
            best = mag;
            refIdx = i;
          }
        }
        const [rr, ri] = entry.statevector[refIdx]!;
        const br = state.re[refIdx]!;
        const bi = state.im[refIdx]!;
        const refMag = Math.hypot(rr, ri);
        const ourMag = Math.hypot(br, bi);
        expect(ourMag).toBeCloseTo(refMag, 8);
        // phase = ours / reference
        const phRe = (br * rr + bi * ri) / (refMag * refMag);
        const phIm = (bi * rr - br * ri) / (refMag * refMag);
        for (let i = 0; i < dim; i++) {
          const [er, ei] = entry.statevector[i]!;
          const expectedRe = er * phRe - ei * phIm;
          const expectedIm = er * phIm + ei * phRe;
          expect(state.re[i]!, `re[${indexToBitstring(i, entry.numQubits)}]`).toBeCloseTo(
            expectedRe,
            8,
          );
          expect(state.im[i]!, `im[${indexToBitstring(i, entry.numQubits)}]`).toBeCloseTo(
            expectedIm,
            8,
          );
        }
      });

      it('sampled counts agree with Aer within statistical tolerance', async () => {
        const circuit = parseQasm(getSampleCircuit(entry.id).qasm);
        const ours = await simulate(circuit, { shots: entry.shots, seed: `xval-${entry.id}` });
        const distance = tvd(normalizeCounts(ours.counts), normalizeCounts(entry.idealCounts));
        // 4096 independent shots on each side: TVD beyond 0.05 would signal
        // a real distribution mismatch, not sampling noise.
        expect(distance).toBeLessThan(0.05);
      });
    });
  }
});
