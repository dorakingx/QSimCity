import { describe, expect, it } from 'vitest';
import { validateTrace } from 'qsimcity-trace';
import { SCENARIOS, getScenario, scenarioRunConfig } from '../src/scenarios/scenarios.js';
import { runVqeScenario, VQE_EXACT_GROUND_ENERGY, VQE_ITERATIONS } from '../src/scenarios/vqe.js';
import { runPipeline } from '../src/pipeline/runPipeline.js';

/**
 * Scenario integration tests (spec §9): every scenario runs with its
 * deterministic seed and meets its own objective completion condition.
 */

describe('scenario catalog', () => {
  it('contains exactly the 12 required scenarios', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'bell-state',
      'ghz-state',
      'teleportation',
      'grover-search',
      'qft',
      'swap-storm',
      'bad-initial-layout',
      'decoherence-weather',
      'readout-bias',
      'shot-drought',
      'dynamic-feedforward',
      'variational-gridlock',
    ]);
  });

  it('every scenario carries complete educational metadata', () => {
    for (const s of SCENARIOS) {
      expect(s.purpose.length, s.id).toBeGreaterThan(20);
      expect(s.causalChain.length, s.id).toBeGreaterThanOrEqual(3);
      expect(s.healthyState.length, s.id).toBeGreaterThan(10);
      expect(s.failureState.length, s.id).toBeGreaterThan(10);
      expect(s.comparisonMetric.length, s.id).toBeGreaterThan(5);
      expect(s.completionText.length, s.id).toBeGreaterThan(10);
      expect(s.seed.startsWith('scenario-'), s.id).toBe(true);
    }
  });

  it('getScenario throws for unknown ids', () => {
    expect(() => getScenario('nonexistent')).toThrow(/Unknown scenario/);
  });
});

describe('pipeline scenarios reach their completion conditions', () => {
  for (const scenario of SCENARIOS.filter((s) => s.kind === 'pipeline')) {
    it(`${scenario.id}: completes with its deterministic seed`, async () => {
      const config = scenarioRunConfig(scenario);
      const { trace } = await runPipeline({
        qasm: config.qasm,
        shots: config.shots,
        seed: config.seed,
        deviceId: config.deviceId,
        noise: config.noiseEnabled ? config.noise : null,
        layoutMethod: config.layoutMethod,
        optimize: config.optimize,
      });
      expect(() => validateTrace(trace)).not.toThrow();
      expect(scenario.isComplete(trace), `${scenario.id} completion condition`).toBe(true);
    }, 30000);
  }
});

describe('variational gridlock (VQE)', () => {
  it('runs the hybrid loop, emits optimizer events, and converges near the exact energy', async () => {
    const scenario = getScenario('variational-gridlock');
    const { trace, finalEnergy, iterations } = await runVqeScenario({
      seed: scenario.seed,
      shots: 512,
    });
    expect(() => validateTrace(trace)).not.toThrow();
    const started = trace.events.filter((e) => e.eventType === 'optimizer.iteration_started');
    const completed = trace.events.filter((e) => e.eventType === 'optimizer.iteration_completed');
    expect(started).toHaveLength(VQE_ITERATIONS);
    expect(completed).toHaveLength(VQE_ITERATIONS);
    expect(iterations).toHaveLength(VQE_ITERATIONS);
    // Documented hamiltonian/ansatz/optimizer provenance (spec §9).
    const loaded = trace.events.find((e) => e.eventType === 'program.loaded')!;
    expect(loaded.payload['hamiltonian']).toBe('Z0*Z1 + 0.5*X0');
    expect(loaded.payload['optimizer']).toContain('grid');
    expect(loaded.payload['exactGroundEnergy']).toBeCloseTo(VQE_EXACT_GROUND_ENERGY, 10);
    // Convergence: monotone non-increasing best energy, final near exact.
    for (let i = 1; i < iterations.length; i++) {
      expect(iterations[i]!.energy).toBeLessThanOrEqual(iterations[i - 1]!.energy + 1e-9);
    }
    expect(Math.abs(finalEnergy - VQE_EXACT_GROUND_ENERGY)).toBeLessThan(0.15);
    expect(scenario.isComplete(trace)).toBe(true);
  }, 60000);

  it('is seed-deterministic', async () => {
    const a = await runVqeScenario({ seed: 'vqe-det', shots: 128 });
    const b = await runVqeScenario({ seed: 'vqe-det', shots: 128 });
    expect(a.finalEnergy).toBe(b.finalEnergy);
    expect(a.finalParams).toEqual(b.finalParams);
  }, 60000);

  it('exact ground energy constant matches dense diagonalization', () => {
    // H = Z0 Z1 + 0.5 X0 in the 2-qubit computational basis (little-endian):
    // ZZ diag: |00>=+1, |01>=-1, |10>=-1, |11>=+1; X0 flips bit 0.
    const h = [
      [1, 0.5, 0, 0],
      [0.5, -1, 0, 0],
      [0, 0, -1, 0.5],
      [0, 0, 0.5, 1],
    ];
    // Block-diagonal 2x2s: eigenvalues ±sqrt(1 + 0.25).
    const eig = Math.sqrt(1.25);
    expect(VQE_EXACT_GROUND_ENERGY).toBeCloseTo(-eig, 12);
    // Verify the 2x2 block eigenvalue algebra explicitly.
    const block = [h[0]![0]!, h[0]![1]!, h[1]![0]!, h[1]![1]!];
    const trace = block[0]! + block[3]!;
    const det = block[0]! * block[3]! - block[1]! * block[2]!;
    const lambdaMin = trace / 2 - Math.sqrt((trace / 2) ** 2 - det);
    expect(lambdaMin).toBeCloseTo(-eig, 12);
  });
});
