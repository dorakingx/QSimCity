import { describe, expect, it } from 'vitest';
import { getSampleCircuit, QasmError } from '@qsimcity/domain';
import { validateTrace } from 'qsimcity-trace';
import { runPipeline } from '../src/pipeline/runPipeline.js';
import { createDirectRunner } from '../src/pipeline/workerClient.js';
import { DEFAULT_CONFIG, DEFAULT_NOISE } from '../src/store/appStore.js';

const BELL = getSampleCircuit('bell').qasm;

describe('runPipeline', () => {
  it('produces a unified schema-valid trace with compiler and execution events', async () => {
    const { trace } = await runPipeline({
      qasm: BELL,
      shots: 100,
      seed: 'pipe-1',
      deviceId: 'linear-5',
      noise: null,
      layoutMethod: 'interaction',
      optimize: true,
    });
    expect(() => validateTrace(trace)).not.toThrow();
    const types = new Set(trace.events.map((e) => e.eventType));
    expect(types.has('circuit.normalized')).toBe(true);
    expect(types.has('layout.assigned')).toBe(true);
    expect(types.has('gate.executed')).toBe(true);
    expect(types.has('measurement.sampled')).toBe(true);
    expect(trace.compiledCircuit).not.toBeNull();
    expect(trace.metrics).toHaveLength(2);
    expect(trace.results.idealProbabilities).toBeDefined();
  });

  it('respects the noise configuration end to end', async () => {
    const { trace } = await runPipeline({
      qasm: BELL,
      shots: 200,
      seed: 'pipe-noise',
      deviceId: 'linear-5',
      noise: { ...DEFAULT_NOISE, readoutError: 0.2 },
      layoutMethod: 'trivial',
      optimize: true,
    });
    expect(trace.noise).not.toBeNull();
    expect(trace.results.noisyCounts).toBeDefined();
    const forbidden = Object.entries(trace.results.noisyCounts!.counts)
      .filter(([k]) => k === '01' || k === '10')
      .reduce((a, [, v]) => a + v, 0);
    expect(forbidden).toBeGreaterThan(0);
  });

  it('is deterministic for identical configurations', async () => {
    const config = {
      qasm: BELL,
      shots: 128,
      seed: 'pipe-det',
      deviceId: 'linear-5' as const,
      noise: null,
      layoutMethod: 'interaction' as const,
      optimize: true,
    };
    const a = await runPipeline(config);
    const b = await runPipeline(config);
    expect(a.trace.results).toEqual(b.trace.results);
    expect(a.trace.compiledCircuit).toEqual(b.trace.compiledCircuit);
  });

  it('reports parser errors with position info', async () => {
    await expect(
      runPipeline({
        qasm: 'OPENQASM 2.0;\nqreg q[2];\nbadgate q[0];',
        shots: 10,
        seed: 's',
        deviceId: 'linear-5',
        noise: null,
        layoutMethod: 'trivial',
        optimize: true,
      }),
    ).rejects.toThrow(QasmError);
  });

  it('routing on a small device honors coupling in the compiled circuit', async () => {
    const { trace } = await runPipeline({
      qasm: getSampleCircuit('swap-storm').qasm,
      shots: 50,
      seed: 'pipe-route',
      deviceId: 'linear-5',
      noise: null,
      layoutMethod: 'trivial',
      optimize: true,
    });
    const compiledMetrics = trace.metrics.find((m) => m.stage === 'compiled')!;
    expect(compiledMetrics.swapCount).toBeGreaterThan(0);
    expect(trace.events.some((e) => e.eventType === 'routing.swap_inserted')).toBe(true);
  });
});

describe('createDirectRunner', () => {
  it('runs a store RunConfig and reports progress', async () => {
    const runner = createDirectRunner();
    const fractions: number[] = [];
    const trace = await runner.run(
      { ...DEFAULT_CONFIG, shots: 64, seed: 'runner-1' },
      (f) => fractions.push(f),
    );
    expect(() => validateTrace(trace)).not.toThrow();
    expect(fractions.at(-1)).toBe(1);
  });

  it('surfaces line/col on parse failures', async () => {
    const runner = createDirectRunner();
    try {
      await runner.run(
        { ...DEFAULT_CONFIG, qasm: 'OPENQASM 2.0;\nqreg q[1];\nnope q[0];', sampleId: null },
        () => {},
      );
      throw new Error('should have thrown');
    } catch (e) {
      const err = e as { line?: number; col?: number };
      expect(err.line).toBe(3);
      expect(err.col).toBe(1);
    }
  });
});
