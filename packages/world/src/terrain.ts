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

/** True when the point lies in open water (beyond either quay edge). */
export function isWater(x: number, _z: number): boolean {
  return x < WEST_COAST_X || x > EAST_COAST_X;
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
export function terrainHeight(x: number, z: number): number {
  if (isWater(x, z)) return SEABED_HEIGHT;
  return PLAIN_HEIGHT + hillHeight(x, z);
}
