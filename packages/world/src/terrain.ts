import { CITY_SCALE } from './districts.js';
import { smoothstep } from './util.js';

/**
 * The city's terrain model (spec §2.1). QSimCity sits on a north-south
 * coastal strip: open sea west of the Program Port, a bay east of the
 * Measurement Harbor, a flat urban plain between the quays, and a single
 * hill in the south crowned by the Observatory.
 *
 * `terrainHeight(x, z)` is the one authority on ground elevation. Every
 * building foundation, road surface, prop, vehicle, and pedestrian samples
 * it, which is what guarantees nothing floats and nothing is buried
 * (acceptance W1.1).
 */

/** Sea level in world units (meters). Water surfaces render at this height. */
export const WATER_LEVEL = 0;

/** Elevation of the urban plain above sea level. */
export const PLAIN_HEIGHT = 2.4;

/** Sea floor elevation used for underwater terrain. */
export const SEABED_HEIGHT = -2.2;

/** X coordinate of the western quay edge; open sea lies west of it. */
export const WEST_COAST_X = -206 * CITY_SCALE;

/** X coordinate of the eastern quay edge; the bay lies east of it. */
export const EAST_COAST_X = 238 * CITY_SCALE;

/** Observatory hill parameters. */
export const HILL_CENTER = { x: -20 * CITY_SCALE, z: 132 * CITY_SCALE } as const;
export const HILL_RADIUS = 82 * CITY_SCALE;
export const HILL_HEIGHT = 16;

/**
 * Smooth, deterministic coastline wander at a given z.
 *
 * A coast made of two perfectly straight lines is the single strongest
 * reason the city read as a rectangular slab sitting on a table: real
 * shorelines are never parallel to a grid. Three sine terms at
 * incommensurable wavelengths give a shoreline that never repeats over the
 * city's length, costs three trig calls, and is exactly reproducible —
 * no runtime randomness anywhere near rendering (W1.10).
 *
 * The offset is always >= 0 and is applied *outward*, into the water. The
 * coast can therefore only ever add land, never eat into it: the western
 * quay road sits about 10 units inside WEST_COAST_X, and a shoreline that
 * wandered inland would flood it.
 */
export const COAST_WANDER = 34;

function coastOffset(z: number, seed: number): number {
  const a = Math.sin(z / 96 + seed * 1.7);
  const b = Math.sin(z / 41 + seed * 4.1);
  const c = Math.sin(z / 173 + seed * 2.3);
  // Normalised to 0..1, then weighted so the long wavelength dominates.
  const wave = (0.55 * a + 0.28 * b + 0.17 * c + 1) / 2;
  return wave * COAST_WANDER;
}

/** X of the western shoreline at a given z (more negative = more land). */
export function westCoastAt(z: number): number {
  return WEST_COAST_X - coastOffset(z, 0.31);
}

/** X of the eastern shoreline at a given z (more positive = more land). */
export function eastCoastAt(z: number): number {
  return EAST_COAST_X + coastOffset(z, 2.87);
}

/** Distance from a point to the nearest shoreline; negative in water. */
export function distanceToShore(x: number, z: number): number {
  return Math.min(x - westCoastAt(z), eastCoastAt(z) - x);
}

/** True when the point lies in open water (beyond the wandering shoreline). */
export function isWater(x: number, z: number): boolean {
  return x < westCoastAt(z) || x > eastCoastAt(z);
}

/** Height of the Observatory hill contribution at a point. */
export function hillHeight(x: number, z: number): number {
  const d = Math.hypot(x - HILL_CENTER.x, z - HILL_CENTER.z);
  return HILL_HEIGHT * smoothstep(1 - d / HILL_RADIUS);
}

/**
 * Ground elevation at a point. Land is the flat urban plain plus the
 * Observatory hill; water areas return the seabed. The quay edges are
 * vertical walls rendered by the visual engine along the coast lines.
 */
/**
 * Long-wavelength roll across the urban plain.
 *
 * Amplitude is deliberately small. Roads sample this every 12 units and
 * buildings sample it at their footprint, so the ground can undulate
 * without anything floating or burying itself (W1.1) — but a plain that is
 * mathematically flat to the millimetre is another reason the city read as
 * a model rather than a place. A metre of rise and fall over a hundred
 * metres is enough for the eye to stop seeing a table top.
 */
const PLAIN_ROLL = 0.9;

function plainRoll(x: number, z: number): number {
  return (
    PLAIN_ROLL *
    (0.6 * Math.sin(x / 137 + 0.7) * Math.cos(z / 118 - 0.4) + 0.4 * Math.sin((x + z) / 83 + 2.1))
  );
}

export function terrainHeight(x: number, z: number): number {
  if (isWater(x, z)) return SEABED_HEIGHT;
  // Foreshore: the land dips to meet the water over the last few metres
  // instead of ending in a vertical wall, so the coast reads as a beach
  // rather than as the cut edge of a slab.
  const shore = distanceToShore(x, z);
  const beach = shore < 18 ? smoothstep(Math.max(0, shore) / 18) : 1;
  const land = PLAIN_HEIGHT + plainRoll(x, z) + hillHeight(x, z);
  return SEABED_HEIGHT + (land - SEABED_HEIGHT) * beach;
}
