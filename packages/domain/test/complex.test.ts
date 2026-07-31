import { describe, expect, it } from 'vitest';
import {
  mat,
  matDagger,
  matEqualUpToGlobalPhase,
  matIdentity,
  matMaxDiff,
  matMul,
} from '../src/complex.js';

const I2 = matIdentity(2);

describe('mat', () => {
  it('lays out entries as interleaved re/im pairs', () => {
    const m = mat([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]);
    expect([...m]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('matMul', () => {
  it('multiplying by identity is a no-op', () => {
    const a = mat([
      [0.3, 0.1],
      [0.2, -0.4],
      [0.5, 0.6],
      [-0.7, 0.8],
    ]);
    expect(matMaxDiff(matMul(a, I2, 2), a)).toBeLessThan(1e-12);
    expect(matMaxDiff(matMul(I2, a, 2), a)).toBeLessThan(1e-12);
  });

  it('computes complex products correctly', () => {
    // [[i, 0], [0, i]] squared = -I
    const iI = mat([
      [0, 1],
      [0, 0],
      [0, 0],
      [0, 1],
    ]);
    const sq = matMul(iI, iI, 2);
    const negI = mat([
      [-1, 0],
      [0, 0],
      [0, 0],
      [-1, 0],
    ]);
    expect(matMaxDiff(sq, negI)).toBeLessThan(1e-12);
  });

  it('is associative', () => {
    const a = mat([
      [1, 1],
      [0, 0],
      [0, 0],
      [1, -1],
    ]);
    const b = mat([
      [0, 1],
      [1, 0],
      [1, 0],
      [0, -1],
    ]);
    const c = mat([
      [0.5, 0],
      [0, 0.5],
      [0.5, 0],
      [0, -0.5],
    ]);
    const left = matMul(matMul(a, b, 2), c, 2);
    const right = matMul(a, matMul(b, c, 2), 2);
    expect(matMaxDiff(left, right)).toBeLessThan(1e-12);
  });
});

describe('matDagger', () => {
  it('conjugate-transposes entries', () => {
    const a = mat([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]);
    const d = matDagger(a, 2);
    expect([...d]).toEqual([1, -2, 5, -6, 3, -4, 7, -8]);
  });

  it('dagger of dagger is the original', () => {
    const a = mat([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]);
    expect(matMaxDiff(matDagger(matDagger(a, 2), 2), a)).toBe(0);
  });
});

describe('matEqualUpToGlobalPhase', () => {
  it('accepts equal matrices', () => {
    const a = mat([
      [1, 0],
      [0, 0],
      [0, 0],
      [1, 0],
    ]);
    expect(matEqualUpToGlobalPhase(a, I2, 2)).toBe(true);
  });

  it('accepts matrices differing by a global phase', () => {
    const phase = { re: Math.cos(0.7), im: Math.sin(0.7) };
    const a = mat([
      [phase.re, phase.im],
      [0, 0],
      [0, 0],
      [phase.re, phase.im],
    ]);
    expect(matEqualUpToGlobalPhase(a, I2, 2)).toBe(true);
  });

  it('rejects matrices differing by a relative phase', () => {
    const a = mat([
      [1, 0],
      [0, 0],
      [0, 0],
      [Math.cos(0.7), Math.sin(0.7)],
    ]);
    expect(matEqualUpToGlobalPhase(a, I2, 2)).toBe(false);
  });

  it('rejects genuinely different matrices', () => {
    const x = mat([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 0],
    ]);
    expect(matEqualUpToGlobalPhase(x, I2, 2)).toBe(false);
  });

  it('treats two zero matrices as equal', () => {
    const z = new Float64Array(8);
    expect(matEqualUpToGlobalPhase(z, new Float64Array(8), 2)).toBe(true);
  });

  it('rejects zero vs non-zero', () => {
    const z = new Float64Array(8);
    expect(matEqualUpToGlobalPhase(I2, z, 2)).toBe(false);
  });
});
