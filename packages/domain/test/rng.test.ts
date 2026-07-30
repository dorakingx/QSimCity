import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../src/rng.js';

describe('createRng', () => {
  it('produces identical streams for identical seeds', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-1');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different streams for different seeds', () => {
    const a = createRng('seed-1');
    const b = createRng('seed-2');
    const va = Array.from({ length: 10 }, () => a.next());
    const vb = Array.from({ length: 10 }, () => b.next());
    expect(va).not.toEqual(vb);
  });

  it('accepts numeric seeds and stringifies them', () => {
    const a = createRng(42);
    const b = createRng('42');
    expect(a.next()).toBe(b.next());
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng('range-check');
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('has an approximately uniform mean', () => {
    const rng = createRng('uniformity');
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) sum += rng.next();
    expect(sum / n).toBeGreaterThan(0.49);
    expect(sum / n).toBeLessThan(0.51);
  });

  it('fills all deciles of [0,1)', () => {
    const rng = createRng('deciles');
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(rng.next() * 10)]!++;
    for (const b of buckets) expect(b).toBeGreaterThan(1500);
  });

  it('nextUint32 returns integers in the 32-bit range', () => {
    const rng = createRng('uint');
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextUint32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('fork produces a deterministic independent stream', () => {
    const a = createRng('parent').fork('child');
    const b = createRng('parent').fork('child');
    const c = createRng('parent').fork('other');
    expect(a.next()).toBe(b.next());
    const av = Array.from({ length: 5 }, () => a.next());
    const cv = Array.from({ length: 5 }, () => c.next());
    expect(av).not.toEqual(cv);
  });

  it('fork does not disturb the parent stream', () => {
    const withFork = createRng('parent');
    withFork.fork('child');
    const without = createRng('parent');
    expect(withFork.next()).toBe(without.next());
  });

  it('property: any seed string yields values in range and deterministic replay', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 40 }), (seed) => {
        const r1 = createRng(seed);
        const r2 = createRng(seed);
        for (let i = 0; i < 20; i++) {
          const v = r1.next();
          if (v < 0 || v >= 1) return false;
          if (v !== r2.next()) return false;
        }
        return true;
      }),
      { numRuns: 200 },
    );
  });
});
