import { describe, expect, it } from 'vitest';
import { createRng, gateDef } from '@qsimcity/domain';
import {
  applyAmplitudeDamping,
  applyDepolarizing,
  applyPhaseDamping,
  applyReadoutError,
  isZeroNoise,
  validateNoiseModel,
  ZERO_NOISE,
} from '../src/noise.js';
import { applyGate1, createState, norm, probabilityOfOne } from '../src/statevector.js';

const X = gateDef('x').matrix([]);
const H = gateDef('h').matrix([]);

describe('noise model validation', () => {
  it('accepts the zero model', () => {
    expect(() => validateNoiseModel(ZERO_NOISE)).not.toThrow();
    expect(isZeroNoise(ZERO_NOISE)).toBe(true);
  });

  it('rejects out-of-range parameters', () => {
    expect(() => validateNoiseModel({ ...ZERO_NOISE, readoutError: 1.5 })).toThrow(
      /within \[0, 1\]/,
    );
    expect(() => validateNoiseModel({ ...ZERO_NOISE, amplitudeDamping: -0.1 })).toThrow(/within/);
    expect(() => validateNoiseModel({ ...ZERO_NOISE, phaseDamping: NaN })).toThrow(/within/);
  });

  it('isZeroNoise detects non-zero components', () => {
    expect(isZeroNoise({ ...ZERO_NOISE, depolarizing2q: 0.01 })).toBe(false);
  });
});

describe('applyReadoutError', () => {
  it('never flips at p=0 and always flips at p=1', () => {
    const rng = createRng('readout');
    for (let i = 0; i < 50; i++) {
      expect(applyReadoutError(0, 0, rng)).toBe(0);
      expect(applyReadoutError(1, 1, rng)).toBe(0);
      expect(applyReadoutError(0, 1, rng)).toBe(1);
    }
  });

  it('flips approximately p fraction of outcomes', () => {
    const rng = createRng('readout-frac');
    let flips = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      if (applyReadoutError(0, 0.2, rng) === 1) flips++;
    }
    expect(flips / n).toBeGreaterThan(0.18);
    expect(flips / n).toBeLessThan(0.22);
  });
});

describe('applyDepolarizing', () => {
  it('does nothing at p=0', () => {
    const s = createState(1);
    const rng = createRng('dep');
    expect(applyDepolarizing(s, 0, 0, rng)).toBeNull();
    expect(s.re[0]).toBe(1);
  });

  it('fires approximately p fraction of the time and reports the Pauli', () => {
    const rng = createRng('dep-frac');
    let fired = 0;
    const paulis = new Set<string>();
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const s = createState(1);
      const ev = applyDepolarizing(s, 0, 0.3, rng);
      if (ev && ev.kind === 'depolarizing') {
        fired++;
        paulis.add(ev.pauli);
        expect(norm(s)).toBeCloseTo(1, 10);
      }
    }
    expect(fired / n).toBeGreaterThan(0.27);
    expect(fired / n).toBeLessThan(0.33);
    expect(paulis).toEqual(new Set(['x', 'y', 'z']));
  });

  it('at p=1 on |0> the ensemble mixes toward maximal mixture', () => {
    // X and Y flip |0> to |1|; Z leaves it. Expect ~2/3 excited.
    const rng = createRng('dep-mix');
    let excited = 0;
    const n = 9000;
    for (let i = 0; i < n; i++) {
      const s = createState(1);
      applyDepolarizing(s, 0, 1, rng);
      excited += probabilityOfOne(s, 0);
    }
    expect(excited / n).toBeGreaterThan(0.63);
    expect(excited / n).toBeLessThan(0.7);
  });
});

describe('applyAmplitudeDamping', () => {
  it('does nothing at gamma=0', () => {
    const s = createState(1);
    applyGate1(s, X, 0);
    expect(applyAmplitudeDamping(s, 0, 0, createRng('ad'))).toBeNull();
    expect(probabilityOfOne(s, 0)).toBeCloseTo(1, 12);
  });

  it('reduces excited-state population on average (spec §18.3)', () => {
    const gamma = 0.4;
    const rng = createRng('ad-pop');
    let p1Sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const s = createState(1);
      applyGate1(s, X, 0); // start in |1>
      applyAmplitudeDamping(s, 0, gamma, rng);
      p1Sum += probabilityOfOne(s, 0);
    }
    // Ensemble average of P(1) should approach 1 - gamma.
    expect(p1Sum / n).toBeGreaterThan(1 - gamma - 0.03);
    expect(p1Sum / n).toBeLessThan(1 - gamma + 0.03);
  });

  it('scales the surviving |1> amplitude by sqrt(1-gamma), not (1-gamma)', () => {
    // On a pure |1> state the scaling is invisible after renormalization,
    // so this must be checked in superposition. For (|0>+|1>)/sqrt(2) the
    // correct channel gives ensemble P(1) = (1-gamma)/2 exactly.
    const gamma = 0.5;
    const rng = createRng('ad-kraus');
    let p1Sum = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const s = createState(1);
      applyGate1(s, H, 0);
      applyAmplitudeDamping(s, 0, gamma, rng);
      p1Sum += probabilityOfOne(s, 0);
    }
    expect(p1Sum / n).toBeGreaterThan((1 - gamma) / 2 - 0.02);
    expect(p1Sum / n).toBeLessThan((1 - gamma) / 2 + 0.02);
  });

  it('fires the depolarizing channel in proportion to p, not a fixed rate', () => {
    const rng = createRng('dep-scaling');
    const measure = (p: number): number => {
      let fired = 0;
      for (let i = 0; i < 4000; i++) {
        const s = createState(1);
        if (applyDepolarizing(s, 0, p, rng)) fired++;
      }
      return fired / 4000;
    };
    const low = measure(0.1);
    const high = measure(0.4);
    expect(low).toBeGreaterThan(0.07);
    expect(low).toBeLessThan(0.13);
    expect(high).toBeGreaterThan(0.36);
    expect(high).toBeLessThan(0.44);
  });

  it('gamma=1 always decays |1> to |0>', () => {
    const s = createState(1);
    applyGate1(s, X, 0);
    const ev = applyAmplitudeDamping(s, 0, 1, createRng('ad-full'));
    expect(ev).toEqual({ kind: 'amplitude_damping', qubit: 0, decayed: true });
    expect(probabilityOfOne(s, 0)).toBeCloseTo(0, 12);
  });

  it('leaves |0> untouched', () => {
    const s = createState(1);
    applyAmplitudeDamping(s, 0, 0.9, createRng('ad-zero'));
    expect(s.re[0]).toBeCloseTo(1, 12);
    expect(norm(s)).toBeCloseTo(1, 12);
  });

  it('keeps the state normalized on both branches', () => {
    const rng = createRng('ad-norm');
    for (let i = 0; i < 200; i++) {
      const s = createState(1);
      applyGate1(s, H, 0);
      applyAmplitudeDamping(s, 0, 0.5, rng);
      expect(norm(s)).toBeCloseTo(1, 10);
    }
  });
});

describe('applyPhaseDamping', () => {
  it('does nothing at lambda=0', () => {
    const s = createState(1);
    applyGate1(s, H, 0);
    expect(applyPhaseDamping(s, 0, 0, createRng('pd'))).toBeNull();
  });

  it('preserves measurement probabilities in the computational basis', () => {
    const rng = createRng('pd-pop');
    let p1Sum = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const s = createState(1);
      applyGate1(s, H, 0);
      applyPhaseDamping(s, 0, 0.7, rng);
      p1Sum += probabilityOfOne(s, 0);
    }
    // Dephasing must not change Z-basis populations: still 1/2.
    expect(p1Sum / n).toBeGreaterThan(0.47);
    expect(p1Sum / n).toBeLessThan(0.53);
  });

  it('destroys coherence: H-noise-H no longer returns to |0> (spec §18.3)', () => {
    // Without noise, H then H restores |0> exactly. With heavy dephasing the
    // ensemble develops |1> population after the second H.
    const rng = createRng('pd-coh');
    let p1Sum = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const s = createState(1);
      applyGate1(s, H, 0);
      applyPhaseDamping(s, 0, 0.8, rng);
      applyGate1(s, H, 0);
      p1Sum += probabilityOfOne(s, 0);
    }
    expect(p1Sum / n).toBeGreaterThan(0.1);
  });

  it('keeps the state normalized on both branches', () => {
    const rng = createRng('pd-norm');
    for (let i = 0; i < 200; i++) {
      const s = createState(1);
      applyGate1(s, H, 0);
      applyPhaseDamping(s, 0, 0.5, rng);
      expect(norm(s)).toBeCloseTo(1, 10);
    }
  });
});
