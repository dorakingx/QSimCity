import { describe, expect, it } from 'vitest';
import { generateBuildings } from '../src/buildings.js';
import { cityPlan } from '../src/city-plan.js';
import { corridorRect } from '../src/roads.js';

/**
 * Real-city architecture contracts (acceptance W1.5, W1.6): buildings vary,
 * meet the ground, and never stand in a road or inside each other.
 */

interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function buildingAabb(b: ReturnType<typeof generateBuildings>[number]): Aabb {
  return {
    minX: b.position[0] - b.collisionHalfExtents[0],
    maxX: b.position[0] + b.collisionHalfExtents[0],
    minZ: b.position[1] - b.collisionHalfExtents[1],
    maxZ: b.position[1] + b.collisionHalfExtents[1],
  };
}

function overlaps(a: Aabb, b: Aabb, tolerance = 0.5): boolean {
  return (
    a.minX < b.maxX - tolerance &&
    a.maxX > b.minX + tolerance &&
    a.minZ < b.maxZ - tolerance &&
    a.maxZ > b.minZ + tolerance
  );
}

describe('architecture', () => {
  const plan = cityPlan();
  // The full building stock: district buildings plus outskirt housing.
  const buildings = plan.buildings;

  it('keeps every building out of every road corridor (W1.6)', () => {
    const corridors = plan.segments.map((s) => ({ id: s.id, rect: corridorRect(s) }));
    for (const building of buildings) {
      const aabb = buildingAabb(building);
      for (const corridor of corridors) {
        expect(
          overlaps(aabb, corridor.rect, 1.0),
          `${building.id} intersects road ${corridor.id}`,
        ).toBe(false);
      }
    }
  });

  it('keeps buildings from intersecting each other (W1.6)', () => {
    for (let i = 0; i < buildings.length; i++) {
      for (let j = i + 1; j < buildings.length; j++) {
        const a = buildings[i]!;
        const b = buildings[j]!;
        expect(overlaps(buildingAabb(a), buildingAabb(b)), `${a.id} intersects ${b.id}`).toBe(
          false,
        );
      }
    }
  });

  it('varies buildings: few identical part signatures citywide (W1.5)', () => {
    const signatureOf = (b: (typeof buildings)[number]): string =>
      b.parts
        .map((p) => `${p.kind}:${p.size.map((v) => v.toFixed(1)).join(',')}:${p.facade ?? ''}`)
        .join('|');
    const fillers = buildings.filter((b) => !b.isLandmark && !b.id.startsWith('outskirt-'));
    const unique = new Set(fillers.map(signatureOf));
    // At least 85 percent of district filler buildings are geometrically
    // unique; outskirt housing is allowed to repeat like real suburbs but
    // must still vary substantially.
    expect(unique.size / fillers.length).toBeGreaterThan(0.85);
    expect(fillers.length).toBeGreaterThan(80);
    const houses = buildings.filter((b) => b.id.startsWith('outskirt-'));
    expect(houses.length).toBeGreaterThan(40);
    const uniqueHouses = new Set(houses.map(signatureOf));
    expect(uniqueHouses.size / houses.length).toBeGreaterThan(0.3);
  });

  it('gives every part a positive size and finite offset', () => {
    for (const building of buildings) {
      for (const part of building.parts) {
        for (const v of part.size) expect(v, building.id).toBeGreaterThan(0);
        for (const v of part.offset) expect(Number.isFinite(v), building.id).toBe(true);
      }
    }
  });

  it('uses facade styles on major masses so the atlas applies (W1.7)', () => {
    const withFacade = buildings.filter((b) =>
      b.parts.some((p) => (p.kind === 'block' || p.kind === 'tower') && p.facade),
    );
    expect(withFacade.length / buildings.length).toBeGreaterThan(0.8);
  });

  it('keeps part extents inside the collision extents', () => {
    for (const building of buildings) {
      for (const part of building.parts) {
        if (part.kind === 'crane' || part.kind === 'bridge' || part.kind === 'ship') continue;
        const [hx, hz] = building.collisionHalfExtents;
        const reachX = Math.abs(part.offset[0]) + part.size[0] / 2;
        const reachZ = Math.abs(part.offset[2]) + part.size[2] / 2;
        // Rotated parts can reach their diagonal; allow that much slack.
        const slack = part.rotationY === 0 ? 1.5 : Math.hypot(part.size[0], part.size[2]) / 2;
        expect(reachX, `${building.id} ${part.kind} x`).toBeLessThanOrEqual(hx + slack + 0.01);
        expect(reachZ, `${building.id} ${part.kind} z`).toBeLessThanOrEqual(hz + slack + 0.01);
      }
    }
  });

  it('is deterministic across calls', () => {
    const districtBuildings = buildings.filter((b) => !b.id.startsWith('outskirt-'));
    expect(generateBuildings()).toEqual(districtBuildings);
    expect(cityPlan().buildings).toEqual(buildings);
  });
});
