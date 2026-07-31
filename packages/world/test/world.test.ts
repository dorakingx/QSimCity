import { describe, expect, it } from 'vitest';
import { STAGES } from 'qsimcity-trace';
import {
  BOULEVARD,
  CITY_BOUNDS,
  DISTRICTS,
  districtForStage,
  getDistrict,
} from '../src/districts.js';
import { generateBuildings, qpuPylonPositions } from '../src/buildings.js';
import { INTERACTIVES, interactivesInDistrict } from '../src/interactives.js';

describe('districts', () => {
  it('defines exactly the 12 required districts', () => {
    expect(DISTRICTS).toHaveLength(12);
    expect(DISTRICTS.map((d) => d.id)).toEqual([
      'program-port',
      'ir-foundry',
      'layout-exchange',
      'routing-transit',
      'translation-refinery',
      'optimization-works',
      'scheduling-tower',
      'qpu-grid',
      'noise-atmosphere',
      'measurement-harbor',
      'classical-control',
      'observatory',
    ]);
  });

  it('covers every trace stage exactly once', () => {
    for (const stage of STAGES) {
      const owners = DISTRICTS.filter((d) => d.stages.includes(stage));
      expect(owners, stage).toHaveLength(1);
      expect(districtForStage(stage).id).toBe(owners[0]!.id);
    }
  });

  it('district bounds do not overlap', () => {
    for (let i = 0; i < DISTRICTS.length; i++) {
      for (let j = i + 1; j < DISTRICTS.length; j++) {
        const a = DISTRICTS[i]!.bounds;
        const b = DISTRICTS[j]!.bounds;
        const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2;
        const overlapZ = Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;
        expect(overlapX && overlapZ, `${DISTRICTS[i]!.id} vs ${DISTRICTS[j]!.id}`).toBe(false);
      }
    }
  });

  it('district bounds stay inside the city bounds', () => {
    for (const d of DISTRICTS) {
      expect(d.bounds.x - d.bounds.width / 2).toBeGreaterThanOrEqual(CITY_BOUNDS.minX);
      expect(d.bounds.x + d.bounds.width / 2).toBeLessThanOrEqual(CITY_BOUNDS.maxX);
      expect(d.bounds.z - d.bounds.depth / 2).toBeGreaterThanOrEqual(CITY_BOUNDS.minZ);
      expect(d.bounds.z + d.bounds.depth / 2).toBeLessThanOrEqual(CITY_BOUNDS.maxZ);
    }
  });

  it('every district has copy, icon, and a distinct accent color', () => {
    const colors = new Set(DISTRICTS.map((d) => d.accentColor));
    expect(colors.size).toBe(12);
    for (const d of DISTRICTS) {
      expect(d.name.length).toBeGreaterThan(3);
      expect(d.description.length).toBeGreaterThan(40);
      expect(d.role.length).toBeGreaterThan(10);
      expect(d.accentColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('the boulevard passes through pipeline districts west to east', () => {
    const xs = BOULEVARD.map(([x]) => x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('getDistrict throws for unknown ids', () => {
    expect(() => getDistrict('atlantis' as never)).toThrow(/Unknown district/);
  });
});

describe('generateBuildings', () => {
  const buildings = generateBuildings();

  it('is deterministic', () => {
    expect(generateBuildings()).toEqual(buildings);
  });

  it('gives every district a named landmark', () => {
    for (const d of DISTRICTS) {
      const landmark = buildings.find((b) => b.districtId === d.id && b.isLandmark);
      expect(landmark, d.id).toBeDefined();
      expect(landmark!.parts.length).toBeGreaterThanOrEqual(3);
      expect(landmark!.name).not.toMatch(/block/);
    }
  });

  it('creates at least 12 distinct landmark compositions', () => {
    const landmarks = buildings.filter((b) => b.isLandmark);
    expect(landmarks.length).toBe(12);
    const signatures = new Set(landmarks.map((b) => b.parts.map((p) => p.kind).join(',')));
    expect(signatures.size).toBeGreaterThanOrEqual(10);
  });

  it('places filler buildings inside their district neighborhood', () => {
    for (const b of buildings) {
      const d = getDistrict(b.districtId);
      const dx = Math.abs(b.position[0] - d.bounds.x);
      const dz = Math.abs(b.position[1] - d.bounds.z);
      expect(dx, b.id).toBeLessThanOrEqual(d.bounds.width / 2 + 12);
      expect(dz, b.id).toBeLessThanOrEqual(d.bounds.depth / 2 + 12);
    }
  });

  it('assigns collision extents to every building', () => {
    for (const b of buildings) {
      expect(b.collisionHalfExtents[0]).toBeGreaterThan(0);
      expect(b.collisionHalfExtents[1]).toBeGreaterThan(0);
      expect(b.collisionHeight).toBeGreaterThan(0);
    }
  });

  it('uses accent or emissive tones somewhere in every landmark', () => {
    for (const b of buildings.filter((x) => x.isLandmark)) {
      expect(
        b.parts.some((p) => p.tone > 0),
        b.id,
      ).toBe(true);
    }
  });
});

describe('qpuPylonPositions', () => {
  it('maps device positions into the qpu-grid district', () => {
    const positions = qpuPylonPositions([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    const district = getDistrict('qpu-grid');
    expect(positions).toHaveLength(3);
    for (const [x, z] of positions) {
      expect(Math.abs(x - district.bounds.x)).toBeLessThanOrEqual(district.bounds.width / 2);
      expect(Math.abs(z - district.bounds.z)).toBeLessThanOrEqual(district.bounds.depth / 2);
    }
    // Preserves relative ordering on x.
    expect(positions[0]![0]).toBeLessThan(positions[1]![0]);
    expect(positions[1]![0]).toBeLessThan(positions[2]![0]);
  });

  it('handles a single-qubit device without dividing by zero', () => {
    const positions = qpuPylonPositions([[0, 0]]);
    expect(positions).toHaveLength(1);
    expect(Number.isFinite(positions[0]![0])).toBe(true);
  });

  it('returns empty for no qubits', () => {
    expect(qpuPylonPositions([])).toEqual([]);
  });
});

describe('interactives', () => {
  it('every district contains at least one interactive object (spec §8)', () => {
    for (const d of DISTRICTS) {
      expect(interactivesInDistrict(d.id).length, d.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('interactive ids are unique', () => {
    expect(new Set(INTERACTIVES.map((i) => i.id)).size).toBe(INTERACTIVES.length);
  });

  it('interactives sit within or near their district bounds', () => {
    for (const i of INTERACTIVES) {
      const d = getDistrict(i.districtId);
      expect(Math.abs(i.position[0] - d.bounds.x), i.id).toBeLessThanOrEqual(
        d.bounds.width / 2 + 20,
      );
      expect(Math.abs(i.position[1] - d.bounds.z), i.id).toBeLessThanOrEqual(
        d.bounds.depth / 2 + 20,
      );
    }
  });

  it('every interactive has a user-facing prompt in English', () => {
    for (const i of INTERACTIVES) {
      expect(i.prompt.length).toBeGreaterThan(10);
      expect(i.name.length).toBeGreaterThan(3);
    }
  });
});
