import { describe, expect, it } from 'vitest';
import { makeCircuit, makeInstruction, parseQasm, getSampleCircuit } from '@qsimcity/domain';
import { validateTrace } from 'qsimcity-trace';
import { runExperiment, circuitToTraceCircuit } from '../src/experiment.js';
import { simulate } from '../src/engine.js';
import { ZERO_NOISE } from '../src/noise.js';

/** Experiment paths not exercised by the main suite. */

describe('circuitToTraceCircuit', () => {
  it('preserves conditions, params, and classical bits', () => {
    const circuit = parseQasm(getSampleCircuit('teleportation').qasm);
    const tc = circuitToTraceCircuit(circuit);
    expect(tc.numQubits).toBe(3);
    expect(tc.cregs.map((r) => r.name)).toEqual(['m0', 'm1', 'out']);
    const conditioned = tc.instructions.filter((i) => i.condition !== null);
    expect(conditioned).toHaveLength(2);
    const rotation = tc.instructions.find((i) => i.name === 'ry')!;
    expect(rotation.params[0]).toBeCloseTo(0.9272952180016122, 12);
  });
});

describe('runExperiment event coverage', () => {
  it('emits noise, reset, and condition events in the noisy phase', async () => {
    const { trace } = await runExperiment(parseQasm(getSampleCircuit('teleportation').qasm), {
      shots: 40,
      seed: 'exp-cov-1',
      programSource: 'teleport',
      noise: {
        readoutError: 0.2,
        depolarizing1q: 0.3,
        depolarizing2q: 0.3,
        amplitudeDamping: 0.2,
        phaseDamping: 0.2,
      },
    });
    expect(() => validateTrace(trace)).not.toThrow();
    const types = new Set(trace.events.map((e) => e.eventType));
    expect(types.has('noise.applied')).toBe(true);
    expect(types.has('classical.condition_evaluated')).toBe(true);
    expect(trace.results.noisyCounts).toBeDefined();
  });

  it('records reset instructions as execution events', async () => {
    const circuit = makeCircuit({
      numQubits: 1,
      cregs: [{ name: 'c', size: 1 }],
      instructions: [
        makeInstruction({ name: 'h', qubits: [0] }),
        makeInstruction({ kind: 'reset', name: 'reset', qubits: [0] }),
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
      ],
    });
    const { trace } = await runExperiment(circuit, {
      shots: 20,
      seed: 'exp-cov-2',
      programSource: 'reset-demo',
    });
    const resetEvent = trace.events.find((e) => (e.payload as { gate?: string }).gate === 'reset');
    expect(resetEvent).toBeDefined();
  });

  it('records skipped conditional gates without executing them', async () => {
    const circuit = makeCircuit({
      numQubits: 2,
      cregs: [{ name: 'm', size: 1 }],
      instructions: [
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
        makeInstruction({ name: 'x', qubits: [1], condition: { creg: 'm', value: 1 } }),
      ],
    });
    // q0 starts in |0>, so the condition never fires.
    const result = await simulate(circuit, { shots: 10, seed: 'skip', noise: ZERO_NOISE });
    const conditions = result.representativeEvents.filter((e) => e.kind === 'condition');
    expect(conditions[0]).toMatchObject({ satisfied: false });
    const gates = result.representativeEvents.filter((e) => e.kind === 'gate');
    expect(gates[0]).toMatchObject({ skipped: true });
  });

  it('reports progress fractions through the experiment', async () => {
    const fractions: number[] = [];
    await runExperiment(parseQasm(getSampleCircuit('bell').qasm), {
      shots: 32,
      seed: 'exp-cov-3',
      programSource: 'bell',
      onProgress: (f) => fractions.push(f),
    });
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions.at(-1)).toBeCloseTo(1, 6);
  });

  it('records a device id when one is supplied', async () => {
    const { trace } = await runExperiment(parseQasm(getSampleCircuit('bell').qasm), {
      shots: 8,
      seed: 'exp-cov-4',
      programSource: 'bell',
      deviceId: 'ring-8',
    });
    expect(trace.deviceId).toBe('ring-8');
  });

  it('handles a circuit with no classical bits', async () => {
    const circuit = makeCircuit({
      numQubits: 1,
      instructions: [makeInstruction({ name: 'h', qubits: [0] })],
    });
    const { trace } = await runExperiment(circuit, {
      shots: 16,
      seed: 'exp-cov-5',
      programSource: 'no-clbits',
    });
    expect(() => validateTrace(trace)).not.toThrow();
    expect(trace.results.idealProbabilities).toBeDefined();
  });

  it('barriers are ignored during execution', async () => {
    const circuit = makeCircuit({
      numQubits: 2,
      cregs: [{ name: 'c', size: 2 }],
      instructions: [
        makeInstruction({ name: 'h', qubits: [0] }),
        makeInstruction({ kind: 'barrier', name: 'barrier', qubits: [0, 1] }),
        makeInstruction({ name: 'cx', qubits: [0, 1] }),
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [1], clbits: [1] }),
      ],
    });
    const result = await simulate(circuit, { shots: 100, seed: 'barrier' });
    expect(Object.keys(result.counts).sort()).toEqual(['00', '11']);
  });

  it('conditioned measure and reset execute when the condition holds', async () => {
    const circuit = makeCircuit({
      numQubits: 2,
      cregs: [
        { name: 'm', size: 1 },
        { name: 'c', size: 1 },
      ],
      instructions: [
        makeInstruction({ name: 'x', qubits: [0] }),
        makeInstruction({ kind: 'measure', name: 'measure', qubits: [0], clbits: [0] }),
        makeInstruction({
          kind: 'reset',
          name: 'reset',
          qubits: [0],
          condition: { creg: 'm', value: 1 },
        }),
        makeInstruction({
          kind: 'measure',
          name: 'measure',
          qubits: [0],
          clbits: [1],
          condition: { creg: 'm', value: 1 },
        }),
      ],
    });
    const result = await simulate(circuit, { shots: 20, seed: 'cond-mr' });
    // m=1 always; the conditional reset returns q0 to |0>, so c reads 0.
    expect(result.counts).toEqual({ '01': 20 });
  });
});
