/**
 * Complex matrices are flat Float64Arrays in row-major order with
 * interleaved (re, im) pairs: a 2x2 matrix occupies 8 numbers.
 * This layout avoids per-element object allocation in gate application.
 */

export type ComplexMatrix = Float64Array;

export function mat(entries: readonly (readonly [number, number])[]): ComplexMatrix {
  const out = new Float64Array(entries.length * 2);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    out[2 * i] = e[0];
    out[2 * i + 1] = e[1];
  }
  return out;
}

/** Matrix product C = A·B for square dim×dim complex matrices. */
export function matMul(a: ComplexMatrix, b: ComplexMatrix, dim: number): ComplexMatrix {
  const c = new Float64Array(dim * dim * 2);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < dim; k++) {
        const are = a[2 * (i * dim + k)]!;
        const aim = a[2 * (i * dim + k) + 1]!;
        const bre = b[2 * (k * dim + j)]!;
        const bim = b[2 * (k * dim + j) + 1]!;
        re += are * bre - aim * bim;
        im += are * bim + aim * bre;
      }
      c[2 * (i * dim + j)] = re;
      c[2 * (i * dim + j) + 1] = im;
    }
  }
  return c;
}

/** Conjugate transpose. */
export function matDagger(a: ComplexMatrix, dim: number): ComplexMatrix {
  const out = new Float64Array(dim * dim * 2);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      out[2 * (j * dim + i)] = a[2 * (i * dim + j)]!;
      out[2 * (j * dim + i) + 1] = -a[2 * (i * dim + j) + 1]!;
    }
  }
  return out;
}

export function matIdentity(dim: number): ComplexMatrix {
  const out = new Float64Array(dim * dim * 2);
  for (let i = 0; i < dim; i++) out[2 * (i * dim + i)] = 1;
  return out;
}

/**
 * Whether A ≈ e^{iφ}·B for some global phase φ.
 * Uses the first entry pair with non-negligible magnitude to fix φ.
 */
export function matEqualUpToGlobalPhase(
  a: ComplexMatrix,
  b: ComplexMatrix,
  dim: number,
  tol = 1e-9,
): boolean {
  let phRe = 1;
  let phIm = 0;
  let found = false;
  for (let i = 0; i < dim * dim; i++) {
    const bre = b[2 * i]!;
    const bim = b[2 * i + 1]!;
    const bmag = Math.hypot(bre, bim);
    if (bmag > 1e-8) {
      const are = a[2 * i]!;
      const aim = a[2 * i + 1]!;
      const amag = Math.hypot(are, aim);
      if (Math.abs(amag - bmag) > tol * 10) return false;
      // φ = arg(a) - arg(b); phase factor = a/b normalized
      phRe = (are * bre + aim * bim) / (bmag * bmag);
      phIm = (aim * bre - are * bim) / (bmag * bmag);
      const phMag = Math.hypot(phRe, phIm);
      phRe /= phMag;
      phIm /= phMag;
      found = true;
      break;
    }
  }
  if (!found) {
    // b ≈ 0 everywhere; equal iff a ≈ 0 too
    for (let i = 0; i < dim * dim * 2; i++) if (Math.abs(a[i]!) > tol) return false;
    return true;
  }
  for (let i = 0; i < dim * dim; i++) {
    const bre = b[2 * i]!;
    const bim = b[2 * i + 1]!;
    const expRe = bre * phRe - bim * phIm;
    const expIm = bre * phIm + bim * phRe;
    if (Math.abs(a[2 * i]! - expRe) > tol || Math.abs(a[2 * i + 1]! - expIm) > tol) return false;
  }
  return true;
}

/** Max |A - B| entry-wise. */
export function matMaxDiff(a: ComplexMatrix, b: ComplexMatrix): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
}
