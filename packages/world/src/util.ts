/**
 * Deterministic hashing helpers shared by every world module. All procedural
 * variety in the city derives from these — never from runtime randomness — so the
 * same source always produces the same city (spec W1.10).
 */

/** FNV-1a based hash of a string to an unsigned 32-bit integer. */
export function hashString(seedText: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic value in [0, 1) from a seed string. */
export function hash01(seedText: string): number {
  return ((hashString(seedText) >>> 8) & 0xffff) / 0x10000;
}

/** Deterministic value in [min, max) from a seed string. */
export function hashRange(seedText: string, min: number, max: number): number {
  return min + hash01(seedText) * (max - min);
}

/** Deterministic integer in [0, n) from a seed string. */
export function hashIndex(seedText: string, n: number): number {
  return n <= 0 ? 0 : hashString(seedText) % n;
}

/** Deterministic pick from a non-empty list. */
export function hashPick<T>(seedText: string, items: readonly T[]): T {
  if (items.length === 0) throw new Error('hashPick requires a non-empty list');
  return items[hashIndex(seedText, items.length)]!;
}

/** Smoothstep easing clamped to [0, 1]. */
export function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export function distance2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
