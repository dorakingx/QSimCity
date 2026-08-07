import { describe, expect, it } from 'vitest';
import {
  COAST_WANDER,
  EAST_COAST_X,
  HILL_CENTER,
  HILL_HEIGHT,
  PLAIN_HEIGHT,
  SEABED_HEIGHT,
  WATER_LEVEL,
  WEST_COAST_X,
  eastCoastAt,
  hillHeight,
  isWater,
  terrainHeight,
  westCoastAt,
} from '../src/terrain.js';
import { generateBuildings } from '../src/buildings.js';
import { cityPlan } from '../src/city-plan.js';
import { INTERACTIVES } from '../src/interactives.js';

describe('terrain', () => {
  it('is water beyond the shoreline and land between the shores', () => {
    // The shoreline wanders with z, so "beyond the coast" is measured
    // against the shoreline at that z, not against a straight line.
    for (const z of [-200, 0, 137, 300]) {
      expect(isWater(westCoastAt(z) - 1, z), `west at z=${z}`).toBe(true);
      expect(isWater(eastCoastAt(z) + 1, z), `east at z=${z}`).toBe(true);
      expect(isWater(0, z), `centre at z=${z}`).toBe(false);
    }
  });

  it('only ever adds land, so the quay roads can never flood', () => {
    // The wander is applied outward. If it could move inland it would put
    // the western quay road — about 10 units inside WEST_COAST_X — in the
    // sea. This is the invariant that makes the irregular coast safe.
    for (let z = -400; z <= 500; z += 7) {
      expect(westCoastAt(z), `west at z=${z}`).toBeLessThanOrEqual(WEST_COAST_X);
      expect(eastCoastAt(z), `east at z=${z}`).toBeGreaterThanOrEqual(EAST_COAST_X);
      expect(WEST_COAST_X - westCoastAt(z)).toBeLessThanOrEqual(COAST_WANDER + 1e-6);
      expect(eastCoastAt(z) - EAST_COAST_X).toBeLessThanOrEqual(COAST_WANDER + 1e-6);
    }
  });

  it('gives the shoreline a genuinely irregular edge', () => {
    // A straight coast is what made the city read as a rectangular slab.
    const samples = Array.from({ length: 80 }, (_, i) => westCoastAt(i * 11 - 400));
    const spread = Math.max(...samples) - Math.min(...samples);
    expect(spread, 'the coast must actually wander').toBeGreaterThan(COAST_WANDER * 0.5);
  });

  it('rolls the urban plain gently and keeps it above water level', () => {
    // The plain is no longer flat to the millimetre — a mathematically
    // level ground plane is part of what read as a table top. It stays
    // within a metre of PLAIN_HEIGHT so nothing floats or buries itself.
    for (const [x, z] of [
      [-150, 20],
      [0, 20],
      [120, -20],
      [200, 100],
    ] as const) {
      const h = terrainHeight(x, z);
      expect(h).toBeGreaterThan(WATER_LEVEL);
      expect(Math.abs(h - PLAIN_HEIGHT), `${x},${z}`).toBeLessThan(1);
    }
  });

  it('raises the Observatory hill to its full height at the center', () => {
    expect(hillHeight(HILL_CENTER.x, HILL_CENTER.z)).toBeCloseTo(HILL_HEIGHT, 5);
    // Plus or minus the plain roll underneath it.
    expect(terrainHeight(HILL_CENTER.x, HILL_CENTER.z)).toBeCloseTo(PLAIN_HEIGHT + HILL_HEIGHT, 0);
  });

  it('returns the seabed under water', () => {
    expect(terrainHeight(westCoastAt(0) - 30, 0)).toBe(SEABED_HEIGHT);
    expect(SEABED_HEIGHT).toBeLessThan(WATER_LEVEL);
  });

  it('grounds every building on land (W1.1)', () => {
    for (const building of generateBuildings()) {
      const h = terrainHeight(building.position[0], building.position[1]);
      expect(h, building.id).toBeGreaterThan(WATER_LEVEL);
    }
  });

  it('keeps every road sample on land (W1.1)', () => {
    for (const segment of cityPlan().segments) {
      for (let t = 0; t <= 1; t += 0.1) {
        const x = segment.a.x + (segment.b.x - segment.a.x) * t;
        const z = segment.a.z + (segment.b.z - segment.a.z) * t;
        expect(isWater(x, z), `${segment.id} at t=${t}`).toBe(false);
      }
    }
  });

  it('grounds every interactive console on land', () => {
    for (const console of INTERACTIVES) {
      expect(terrainHeight(console.position[0], console.position[1])).toBeGreaterThan(WATER_LEVEL);
    }
  });

  it('keeps land-side props on land and buoys in water (W1.1)', () => {
    for (const prop of cityPlan().props) {
      const inWater = isWater(prop.position.x, prop.position.z);
      if (prop.kind === 'buoy' || prop.kind === 'ship') {
        expect(inWater, `${prop.kind} at ${prop.position.x},${prop.position.z}`).toBe(true);
      } else {
        expect(inWater, `${prop.kind} at ${prop.position.x},${prop.position.z}`).toBe(false);
      }
    }
  });
});
