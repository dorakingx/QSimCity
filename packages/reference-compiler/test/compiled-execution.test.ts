import { describe, expect, it } from 'vitest';
import { getDevice, getSampleCircuit, parseQasm, SAMPLE_CIRCUITS } from '@qsimcity/domain';
import { simulate, MAX_EXACT_QUBITS } from '@qsimcity/simulator';
import { compile } from '../src/compile.js';

/**
 * End-to-end compiler validation: run the *compiled* circuit on physical
 * qubits and require the measured distribution to match the input circuit's.
 *
 * This is stricter than unitary equivalence because it also exercises the
 * classical-bit mapping through layout and routing — the place where a
 * layout bug would silently scramble results while every unitary check
 * still passed.
 */

function tvd(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const totalA = Object.values(a).reduce((x, y) => x + y, 0) || 1;
  const totalB = Object.values(b).reduce((x, y) => x + y, 0) || 1;
  let d = 0;
  for (const k of keys) d += Math.abs((a[k] ?? 0) / totalA - (b[k] ?? 0) / totalB);
  return d / 2;
}

const DEVICES = ['linear-5', 'ring-8', 'tee-7', 'full-5'] as const;

describe('compiled circuits reproduce input measurement statistics', () => {
  for (const sample of SAMPLE_CIRCUITS) {
    const circuit = parseQasm(sample.qasm);
    for (const deviceId of DEVICES) {
      const device = getDevice(deviceId);
      if (circuit.numQubits > device.numQubits) continue;
      if (device.numQubits > MAX_EXACT_QUBITS) continue;

      for (const layoutMethod of ['trivial', 'interaction'] as const) {
        it(`${sample.id} on ${deviceId} with ${layoutMethod} layout`, async () => {
          const compiled = compile(circuit, { device, layoutMethod });
          const seed = `compiled-${sample.id}-${deviceId}-${layoutMethod}`;
          const reference = await simulate(circuit, { shots: 4000, seed: `${seed}-ref` });
          const actual = await simulate(compiled.compiled, { shots: 4000, seed: `${seed}-cmp` });
          // Both distributions are over the same classical registers, so a
          // correct compile leaves them statistically indistinguishable.
          expect(tvd(reference.counts, actual.counts), `${sample.id}/${deviceId}/${layoutMethod}`).toBeLessThan(
            0.06,
          );
        }, 30_000);
      }
    }
  }

  it('a deliberately bad manual layout still produces correct statistics', async () => {
    const circuit = parseQasm(getSampleCircuit('ghz-4').qasm);
    const device = getDevice('tee-7');
    // Scatter the logical qubits to the far corners of the topology.
    const compiled = compile(circuit, { device, layoutMethod: [0, 6, 2, 4] });
    const reference = await simulate(circuit, { shots: 4000, seed: 'bad-layout-ref' });
    const actual = await simulate(compiled.compiled, { shots: 4000, seed: 'bad-layout-cmp' });
    expect(compiled.swapCount).toBeGreaterThan(0);
    expect(tvd(reference.counts, actual.counts)).toBeLessThan(0.06);
  }, 30_000);

  it('classical-bit mapping survives a non-trivial layout', async () => {
    // q0 -> c2, q1 -> c0, q2 -> c1 with only q0 excited: expect exactly 100.
    const circuit = parseQasm(
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\ncreg c[3];\nx q[0];\ncx q[0],q[2];\nmeasure q[0] -> c[2];\nmeasure q[1] -> c[0];\nmeasure q[2] -> c[1];',
    );
    const compiled = compile(circuit, { device: getDevice('tee-7'), layoutMethod: 'interaction' });
    const result = await simulate(compiled.compiled, { shots: 200, seed: 'clbit-map' });
    // c2=1 (q0), c1=1 (q2 flipped by cx), c0=0 (q1) -> bitstring "110".
    expect(result.counts).toEqual({ '110': 200 });
  }, 30_000);

  it('optimization does not change measurement statistics', async () => {
    const circuit = parseQasm(getSampleCircuit('qft-3').qasm);
    const device = getDevice('linear-5');
    const optimized = compile(circuit, { device, optimize: true });
    const raw = compile(circuit, { device, optimize: false });
    const a = await simulate(optimized.compiled, { shots: 4000, seed: 'opt-a' });
    const b = await simulate(raw.compiled, { shots: 4000, seed: 'opt-b' });
    expect(tvd(a.counts, b.counts)).toBeLessThan(0.06);
    expect(optimized.compiledMetrics.gateCount).toBeLessThanOrEqual(raw.compiledMetrics.gateCount);
  }, 30_000);
});
