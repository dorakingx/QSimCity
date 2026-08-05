import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DISTRICTS, INTERACTIVES, qpuPylonPositions } from '@qsimcity/world';
import { accentBaseIntensity, buildCity, buildQpu } from '../src/city-builder.js';

/**
 * Static city construction contracts: the whole city builds headless (no
 * WebGL needed for geometry), every surface the engine relies on exists,
 * picking ranges resolve to real targets, and time-of-day switches the
 * emissive story. This is the builder the visual snapshots render.
 */

describe('buildCity', () => {
  const city = buildCity();

  it('creates the core environment meshes', () => {
    for (const name of [
      'terrain',
      'water',
      'quays',
      'roads-marked',
      'roads-plain',
      'sidewalks',
      'medians',
      'crosswalks',
      'parcel-ground',
      'building-parts',
      'campus-rails',
      'ships',
    ]) {
      expect(city.group.getObjectByName(name), name).toBeDefined();
    }
  });

  it('creates a facade mesh per used style and one accent mesh per district', () => {
    const facadeNames: string[] = [];
    city.group.traverse((o) => {
      if (o.name.startsWith('facade-')) facadeNames.push(o.name);
    });
    expect(facadeNames.length).toBeGreaterThanOrEqual(5);
    expect(city.districtAccents.size).toBe(DISTRICTS.length);
    for (const district of DISTRICTS) {
      expect(city.districtAccents.get(district.id), district.id).toBeDefined();
    }
  });

  it('instances the street props', () => {
    for (const name of [
      'lamp-poles',
      'lamp-heads',
      'lamp-pools',
      'tree-trunks',
      'tree-canopies',
      'tree-conifers',
      'benches',
      'containers',
      'parked-car-bodies',
      'fence-posts',
      'buoys',
    ]) {
      const mesh = city.group.getObjectByName(name) as THREE.InstancedMesh;
      expect(mesh, name).toBeDefined();
      expect(mesh.count, name).toBeGreaterThan(0);
    }
  });

  it('builds a kiosk for every interactive console', () => {
    expect(city.interactiveMeshes.size).toBe(INTERACTIVES.length);
    for (const interactive of INTERACTIVES) {
      const kiosk = city.interactiveMeshes.get(interactive.id);
      expect(kiosk, interactive.id).toBeDefined();
      expect(city.objectPicks.get(kiosk!)).toEqual({
        kind: 'interactive',
        interactiveId: interactive.id,
      });
    }
  });

  it('maps merged-mesh pick ranges to real buildings and districts', () => {
    const buildingIds = new Set(city.buildings.map((b) => b.id));
    const districtIds = new Set(DISTRICTS.map((d) => d.id));
    let buildingRanges = 0;
    let districtRanges = 0;
    for (const ranges of city.rangedPicks.values()) {
      for (const range of ranges) {
        expect(range.count).toBeGreaterThan(0);
        if (range.target.kind === 'building') {
          buildingRanges++;
          expect(buildingIds.has(range.target.buildingId!), range.target.buildingId).toBe(true);
        }
        if (range.target.kind === 'district') {
          districtRanges++;
          expect(districtIds.has(range.target.districtId as never)).toBe(true);
        }
      }
    }
    expect(buildingRanges).toBeGreaterThan(200);
    expect(districtRanges).toBeGreaterThan(50);
  });

  it('keeps range starts strictly increasing within each mesh', () => {
    for (const ranges of city.rangedPicks.values()) {
      let last = -1;
      for (const range of ranges) {
        expect(range.start).toBeGreaterThan(last);
        last = range.start;
      }
    }
  });

  it('applies time of day to windows, lamps, and accents', () => {
    const lampHeads = city.group.getObjectByName('lamp-heads') as THREE.InstancedMesh;
    const lampPools = city.group.getObjectByName('lamp-pools') as THREE.InstancedMesh;
    const headMaterial = lampHeads.material as THREE.MeshStandardMaterial;
    const poolMaterial = lampPools.material as THREE.MeshBasicMaterial;
    city.applyTimeOfDay('day');
    expect(headMaterial.emissiveIntensity).toBe(0);
    expect(poolMaterial.opacity).toBe(0);
    city.applyTimeOfDay('night');
    expect(headMaterial.emissiveIntensity).toBeGreaterThan(1);
    expect(poolMaterial.opacity).toBeGreaterThan(0.2);
    const accent = city.districtAccents.get('qpu-grid')!;
    expect((accent.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(
      accentBaseIntensity('night'),
    );
    city.applyTimeOfDay('golden');
    expect(headMaterial.emissiveIntensity).toBeGreaterThan(0);
  });

  it('marks small props for the far-distance tier', () => {
    expect(city.farHidden.length).toBeGreaterThanOrEqual(3);
  });

  it('disposes without throwing', () => {
    const disposable = buildCity();
    expect(() => disposable.dispose()).not.toThrow();
  });
});

describe('buildQpu', () => {
  it('builds pylons and coupling bridges on the terrain', () => {
    const positions = [
      [0, 0],
      [1, 0],
      [2, 0],
    ] as const;
    const world = qpuPylonPositions(positions);
    const qpu = buildQpu(
      positions,
      [
        [0, 1],
        [1, 2],
      ],
      '#38d8d0',
      world,
    );
    expect(qpu.pylons).toHaveLength(3);
    expect(qpu.bridges.size).toBe(2);
    expect(qpu.pylons[0]!.name).toBe('qubit-0');
    for (const pylon of qpu.pylons) {
      expect(pylon.position.y).toBeGreaterThan(0);
    }
    qpu.dispose();
  });
});
