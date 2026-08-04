import { describe, expect, it } from 'vitest';
import {
  EAST_COAST_X,
  HILL_CENTER,
  HILL_HEIGHT,
  PLAIN_HEIGHT,
  SEABED_HEIGHT,
  WATER_LEVEL,
  WEST_COAST_X,
  hillHeight,
  isWater,
  terrainHeight,
} from '../src/terrain.js';
import { generateBuildings } from '../src/buildings.js';
import { cityPlan } from '../src/city-plan.js';
import { INTERACTIVES } from '../src/interactives.js';

describe('terrain', () => {
  it('is water beyond both coasts and land between them', () => {
    expect(isWater(WEST_COAST_X - 1, 0)).toBe(true);
    expect(isWater(EAST_COAST_X + 1, 0)).toBe(true);
    expect(isWater(0, 0)).toBe(false);
    expect(isWater(WEST_COAST_X + 1, 100)).toBe(false);
  });

  it('keeps the urban plain flat and above water level', () => {
    for (const [x, z] of [
      [-150, 20],
      [0, 20],
      [120, -20],
      [200, 100],
    ] as const) {
      expect(terrainHeight(x, z)).toBeCloseTo(PLAIN_HEIGHT, 5);
      expect(terrainHeight(x, z)).toBeGreaterThan(WATER_LEVEL);
    }
  });

  it('raises the Observatory hill to its full height at the center', () => {
    expect(hillHeight(HILL_CENTER.x, HILL_CENTER.z)).toBeCloseTo(HILL_HEIGHT, 5);
    expect(terrainHeight(HILL_CENTER.x, HILL_CENTER.z)).toBeCloseTo(PLAIN_HEIGHT + HILL_HEIGHT, 5);
  });

  it('returns the seabed under water', () => {
    expect(terrainHeight(WEST_COAST_X - 30, 0)).toBe(SEABED_HEIGHT);
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
