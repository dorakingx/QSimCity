/**
 * Deterministic seeded PRNG (sfc32). Not cryptographic; used only for
 * reproducible measurement sampling and noise trajectories. The same seed
 * must produce the same stream on every platform, so only 32-bit integer
 * arithmetic and Math.fround-free operations are used.
 */

export interface Rng {
  /** Uniform float in [0, 1) with 32 bits of entropy. */
  next(): number;
  /** Uniform unsigned 32-bit integer. */
  nextUint32(): number;
  /** Independent child stream derived from this seed and a label. */
  fork(label: string): Rng;
  readonly seed: string;
}

/** MurmurHash3-style string mixer producing a stream of 32-bit seeds. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed: string | number): Rng {
  const seedStr = String(seed);
  const mix = xmur3(seedStr);
  const gen = sfc32(mix(), mix(), mix(), mix());
  // sfc32 needs a warm-up to decorrelate nearby seeds.
  for (let i = 0; i < 12; i++) gen();
  return {
    seed: seedStr,
    next: gen,
    nextUint32: () => Math.floor(gen() * 4294967296) >>> 0,
    fork: (label: string) => createRng(`${seedStr}/${label}`),
  };
}
