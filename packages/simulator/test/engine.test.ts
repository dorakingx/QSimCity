import { describe, expect, it } from 'vitest';
import {
  parseQasm,
  SAMPLE_CIRCUITS,
  getSampleCircuit,
  makeCircuit,
  makeInstruction,
} from '@qsimcity/domain';
import { isDynamicCircuit, simulate, SimulationCancelledError, MAX_SHOTS } from '../src/engine.js';
import { ZERO_NOISE } from '../src/noise.js';

const BELL = getSampleCircuit('bell').qasm;
const TELEPORT = getSampleCircuit('teleportation').qasm;

async function run(
  qasm: string,
  opts: { shots?: number; seed?: string; noise?: Partial<typeof ZERO_NOISE> } = {},
) {
  return simulate(parseQasm(qasm), {
    shots: opts.shots ?? 1000,
    seed: opts.seed ?? 'test-seed',
    noise: { ...ZERO_NOISE, ...(opts.noise ?? {}) },
  });
}

describe('isDynamicCircuit', () => {
  it('classifies terminal-measurement circuits as static', () => {
    expect(isDynamicCircuit(parseQasm(BELL))).toBe(false);
  });

  it('classifies conditions, resets, and mid-circuit measurement as dynamic', () => {
    expect(isDynamicCircuit(parseQasm(TELEPORT))).toBe(true);
    expect(
      isDynamicCircuit(parseQasm('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\nreset q[0];')),
    ).toBe(true);
    expect(
      isDynamicCircuit(
        parseQasm(
          'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nmeasure q[0] -> c[0];\nx q[0];',
        ),
      ),
    ).toBe(true);
  });
});

describe('ideal static simulation', () => {
  it('Bell state gives exact 50/50 over 00 and 11', async () => {
    const r = await run(BELL);
    expect(r.exactProbabilities).not.toBeNull();
    expect(r.exactProbabilities!['00']).toBeCloseTo(0.5, 10);
    expect(r.exactProbabilities!['11']).toBeCloseTo(0.5, 10);
    expect(r.exactProbabilities!['01']).toBeUndefined();
    expect(r.noiseWasApplied).toBe(false);
  });

  it('sampled counts total the requested shots and stay near expectation', async () => {
    const r = await run(BELL, { shots: 4000 });
    const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(4000);
    expect(r.counts['00']!).toBeGreaterThan(1800);
    expect(r.counts['11']!).toBeGreaterThan(1800);
  });

  it('is deterministic for a fixed seed', async () => {
    const a = await run(BELL, { seed: 'fixed' });
    const b = await run(BELL, { seed: 'fixed' });
    expect(a.counts).toEqual(b.counts);
  });

  it('different seeds give different samples', async () => {
    const a = await run(BELL, { seed: 'one', shots: 500 });
    const b = await run(BELL, { seed: 'two', shots: 500 });
    expect(a.counts).not.toEqual(b.counts);
  });

  it('GHZ-4 yields only 0000 and 1111', async () => {
    const r = await run(getSampleCircuit('ghz-4').qasm);
    expect(Object.keys(r.exactProbabilities!).sort()).toEqual(['0000', '1111']);
  });

  it('Grover-2 finds the marked state with certainty', async () => {
    const r = await run(getSampleCircuit('grover-2').qasm);
    expect(r.exactProbabilities!['11']).toBeCloseTo(1, 10);
    expect(r.counts['11']).toBe(1000);
  });

  it('Toffoli sample flips the target deterministically', async () => {
    const r = await run(getSampleCircuit('toffoli').qasm);
    expect(r.exactProbabilities!['111']).toBeCloseTo(1, 10);
  });

  it('unmeasured circuits report probabilities over qubit basis states', async () => {
    const r = await run('OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\nh q[0];');
    expect(Object.keys(r.exactProbabilities!).sort()).toEqual(['00', '01']);
  });

  it('measurement into a partial register leaves other clbits zero', async () => {
    const r = await run(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[3];\nx q[1];\nmeasure q[1] -> c[2];',
    );
    expect(r.exactProbabilities!['100']).toBeCloseTo(1, 10);
  });

  it('classical-bit mapping follows qubit->clbit pairs, not qubit order', async () => {
    const r = await run(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nx q[0];\nmeasure q[0] -> c[1];\nmeasure q[1] -> c[0];',
    );
    // qubit0=1 recorded into clbit 1 (leftmost of two)
    expect(r.exactProbabilities!['10']).toBeCloseTo(1, 10);
  });
});

describe('dynamic circuits', () => {
  it('teleportation delivers the payload distribution to the output bit', async () => {
    const r = await run(TELEPORT, { shots: 4000, seed: 'tp' });
    // Payload ry(0.9273) => P(1) = sin^2(0.4636) ~ 0.2. Output bit is out[0],
    // the highest clbit (leftmost). Aggregate over the Bell measurement bits.
    let ones = 0;
    for (const [key, count] of Object.entries(r.counts)) {
      if (key.startsWith('1')) ones += count;
    }
    expect(ones / 4000).toBeGreaterThan(0.17);
    expect(ones / 4000).toBeLessThan(0.23);
    expect(r.dynamic).toBe(true);
    expect(r.exactProbabilities).toBeNull();
  });

  it('feed-forward applies X only when the measured bit is 1', async () => {
    const r = await run(getSampleCircuit('dynamic-feedforward').qasm, { shots: 2000, seed: 'ff' });
    // Registers: m (bit 0, rightmost), c (bit 1). Feed-forward guarantees
    // c equals m every shot: only '00' and '11' appear.
    expect(Object.keys(r.counts).sort()).toEqual(['00', '11']);
  });

  it('reset returns qubits to |0> from any state', async () => {
    const r = await run(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nh q[0];\nreset q[0];\nmeasure q[0] -> c[0];',
      { shots: 500 },
    );
    expect(r.counts).toEqual({ '0': 500 });
  });

  it('condition compares the whole register value', async () => {
    const r = await run(
      `OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg m[2];
creg out[1];
x q[0];
x q[1];
measure q[0] -> m[0];
measure q[1] -> m[1];
if (m == 3) x q[2];
measure q[2] -> out[0];`,
      { shots: 200 },
    );
    // m = 11 binary = 3, so out must always be 1: key '111'.
    expect(r.counts).toEqual({ '111': 200 });
  });

  it('records condition evaluations in representative events', async () => {
    const r = await run(TELEPORT, { shots: 10, seed: 'events' });
    const conditions = r.representativeEvents.filter((e) => e.kind === 'condition');
    expect(conditions).toHaveLength(2);
  });
});

describe('noisy simulation', () => {
  it('zero noise matches ideal behavior exactly (spec §18.3)', async () => {
    const ideal = await run(BELL, { seed: 'zn', shots: 500 });
    const noisyZero = await simulate(parseQasm(BELL), {
      shots: 500,
      seed: 'zn',
      noise: { ...ZERO_NOISE },
    });
    expect(noisyZero.counts).toEqual(ideal.counts);
    expect(noisyZero.noiseWasApplied).toBe(false);
  });

  it('readout error introduces forbidden outcomes in a Bell circuit', async () => {
    const r = await run(BELL, { shots: 3000, noise: { readoutError: 0.15 }, seed: 'ro' });
    const forbidden = (r.counts['01'] ?? 0) + (r.counts['10'] ?? 0);
    // Each of 2 bits flips independently at 15%: P(exactly one flip) ~ 25.5%.
    expect(forbidden / 3000).toBeGreaterThan(0.2);
    expect(forbidden / 3000).toBeLessThan(0.31);
    expect(r.noiseWasApplied).toBe(true);
    expect(r.exactProbabilities).toBeNull();
  });

  it('depolarizing noise degrades the Grover success probability', async () => {
    const clean = await run(getSampleCircuit('grover-2').qasm, { shots: 2000, seed: 'g' });
    const noisy = await run(getSampleCircuit('grover-2').qasm, {
      shots: 2000,
      seed: 'g',
      noise: { depolarizing1q: 0.05, depolarizing2q: 0.1 },
    });
    expect(clean.counts['11']).toBe(2000);
    expect(noisy.counts['11']!).toBeLessThan(2000 * 0.9);
  });

  it('amplitude damping biases an excited qubit toward 0', async () => {
    const r = await run(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[1];\ncreg c[1];\nx q[0];\nmeasure q[0] -> c[0];',
      { shots: 3000, noise: { amplitudeDamping: 0.3 }, seed: 'ad' },
    );
    // One gate then measurement: P(0) ~ gamma = 0.3.
    expect((r.counts['0'] ?? 0) / 3000).toBeGreaterThan(0.26);
    expect((r.counts['0'] ?? 0) / 3000).toBeLessThan(0.34);
  });

  it('noisy counts remain normalized to shot total', async () => {
    const r = await run(BELL, {
      shots: 1234,
      noise: { readoutError: 0.1, depolarizing2q: 0.1, amplitudeDamping: 0.05, phaseDamping: 0.05 },
    });
    expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(1234);
  });

  it('noisy runs are seed-reproducible', async () => {
    const opts = { shots: 800, seed: 'repro', noise: { readoutError: 0.1, depolarizing1q: 0.05 } };
    const a = await run(BELL, opts);
    const b = await run(BELL, opts);
    expect(a.counts).toEqual(b.counts);
  });
});

describe('limits, progress, and cancellation', () => {
  it('rejects invalid shot counts', async () => {
    await expect(run(BELL, { shots: 0 })).rejects.toThrow(/Shot count/);
    await expect(run(BELL, { shots: MAX_SHOTS + 1 })).rejects.toThrow(/Shot count/);
    await expect(run(BELL, { shots: 2.5 })).rejects.toThrow(/Shot count/);
  });

  it('rejects circuits above the exact-simulation qubit limit with guidance', async () => {
    const big = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[13];\nh q[0];';
    await expect(run(big)).rejects.toThrow(/at most 12 qubits/);
  });

  it('reports monotonic progress', async () => {
    const fractions: number[] = [];
    await simulate(parseQasm(TELEPORT), {
      shots: 2000,
      seed: 'prog',
      onProgress: (done, total) => fractions.push(done / total),
    });
    expect(fractions.length).toBeGreaterThan(1);
    expect(fractions.at(-1)).toBe(1);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]!).toBeGreaterThanOrEqual(fractions[i - 1]!);
    }
  });

  it('supports cancellation between batches', async () => {
    let calls = 0;
    await expect(
      simulate(parseQasm(TELEPORT), {
        shots: 5000,
        seed: 'cancel',
        batchSize: 100,
        shouldCancel: () => ++calls >= 2,
      }),
    ).rejects.toThrow(SimulationCancelledError);
  });

  it('every bundled sample circuit simulates without error', async () => {
    for (const sample of SAMPLE_CIRCUITS) {
      const r = await simulate(parseQasm(sample.qasm), { shots: 50, seed: `sample-${sample.id}` });
      const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
      expect(total, sample.id).toBe(50);
    }
  });
});

describe('noisy circuits without classical bits', () => {
  it('produces no phantom outcome keys when there is nothing to record', async () => {
    // A noisy circuit with no creg has nothing to count; the shot loop must
    // not fabricate an empty-bitstring outcome.
    const circuit = makeCircuit({
      numQubits: 1,
      instructions: [makeInstruction({ name: 'h', qubits: [0] })],
    });
    const result = await simulate(circuit, {
      shots: 64,
      seed: 'no-clbits-noisy',
      noise: { ...ZERO_NOISE, depolarizing1q: 0.2 },
    });
    expect(result.noiseWasApplied).toBe(true);
    expect(Object.keys(result.counts)).toEqual([]);
  });

  it('still records outcomes for a noisy circuit that does measure', async () => {
    const circuit = makeCircuit({
      numQubits: 1,
      cregs: [{ name: 'c', size: 1 }],
      instructions: [
        makeInstruction({ name: 'h', qubits: [0] }),
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
      ],
    });
    const result = await simulate(circuit, {
      shots: 64,
      seed: 'clbits-noisy',
      noise: { ...ZERO_NOISE, readoutError: 0.1 },
    });
    expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(64);
  });
});

describe('unsatisfied classical conditions', () => {
  it('does not record a gate event for a skipped conditioned measure or reset', async () => {
    // The skipped-instruction event is only meaningful for gates; recording a
    // measure or reset as a skipped "gate" would mislabel the trace.
    const circuit = makeCircuit({
      numQubits: 1,
      cregs: [
        { name: 'm', size: 1 },
        { name: 'c', size: 1 },
      ],
      instructions: [
        // m stays 0, so both conditioned instructions are skipped.
        makeInstruction({
          kind: 'measure',
          name: 'measure',
          qubits: [0],
          clbits: [1],
          condition: { creg: 'm', value: 1 },
        }),
        makeInstruction({
          kind: 'reset',
          name: 'reset',
          qubits: [0],
          condition: { creg: 'm', value: 1 },
        }),
      ],
    });
    const result = await simulate(circuit, { shots: 8, seed: 'skipped-nongate' });
    const conditions = result.representativeEvents.filter((e) => e.kind === 'condition');
    expect(conditions).toHaveLength(2);
    expect(conditions.every((c) => c.kind === 'condition' && !c.satisfied)).toBe(true);
    // No gate events at all: the circuit contains no gates.
    expect(result.representativeEvents.filter((e) => e.kind === 'gate')).toHaveLength(0);
  });

  it('records a skipped gate event when a conditioned gate does not fire', async () => {
    const circuit = makeCircuit({
      numQubits: 1,
      cregs: [{ name: 'm', size: 1 }],
      instructions: [
        makeInstruction({ name: 'x', qubits: [0], condition: { creg: 'm', value: 1 } }),
      ],
    });
    const result = await simulate(circuit, { shots: 4, seed: 'skipped-gate' });
    const gates = result.representativeEvents.filter((e) => e.kind === 'gate');
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ skipped: true });
  });
});
