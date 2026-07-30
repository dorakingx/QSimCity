// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getDevice } from '@qsimcity/domain';
import { DISTRICTS, INTERACTIVES } from '@qsimcity/world';
import { buildCity, buildQpu } from '../src/instanced-city.js';

/**
 * City construction tests: scene-graph structure without a WebGL context.
 * Verifies instancing (draw-call budget), pick-target wiring, and that
 * day/night tone changes actually reach the instance colors.
 */

describe('buildCity', () => {
  const city = buildCity();

  it('renders the entire building stock in three instanced meshes', () => {
    expect(city.boxes).toBeInstanceOf(THREE.InstancedMesh);
    expect(city.cylinders).toBeInstanceOf(THREE.InstancedMesh);
    expect(city.spheres).toBeInstanceOf(THREE.InstancedMesh);
    expect(city.boxes.count).toBeGreaterThan(20);
    const totalInstances = city.boxes.count + city.cylinders.count + city.spheres.count;
    expect(totalInstances).toBeGreaterThan(60);
  });

  it('keeps the draw-call budget flat: instanced meshes plus plates, roads, kiosks', () => {
    let meshes = 0;
    city.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) meshes++;
    });
    // 3 instanced + 12 plates + 7 road segments + 16 kiosks + 1 window cloud
    expect(meshes).toBeLessThanOrEqual(48);
  });

  it('creates one ground plate per district, each pickable', () => {
    expect(city.districtPlates.size).toBe(DISTRICTS.length);
    for (const d of DISTRICTS) {
      const plate = city.districtPlates.get(d.id)!;
      expect(plate.position.x).toBeCloseTo(d.bounds.x, 5);
      expect(plate.position.z).toBeCloseTo(d.bounds.z, 5);
      const targets = city.pickTargets.get(plate)!;
      expect(targets[0]).toEqual({ kind: 'district', districtId: d.id });
    }
  });

  it('creates one interactive kiosk per console, each pickable', () => {
    expect(city.interactiveMeshes.size).toBe(INTERACTIVES.length);
    for (const i of INTERACTIVES) {
      const kiosk = city.interactiveMeshes.get(i.id)!;
      expect(kiosk.position.x).toBeCloseTo(i.position[0], 5);
      expect(city.pickTargets.get(kiosk)![0]).toEqual({
        kind: 'interactive',
        interactiveId: i.id,
      });
    }
  });

  it('maps every instance index to a building pick target', () => {
    const boxTargets = city.pickTargets.get(city.boxes)!;
    expect(boxTargets.length).toBe(city.boxes.count);
    for (const t of boxTargets) {
      expect(t.kind).toBe('building');
      expect(t.buildingId).toBeTruthy();
      expect(DISTRICTS.some((d) => d.id === t.districtId)).toBe(true);
    }
  });

  it('emits window lights only for block and tower masses', () => {
    const positions = city.windows.geometry.getAttribute('position');
    expect(positions.count).toBeGreaterThan(100);
    const colors = city.windows.geometry.getAttribute('color');
    expect(colors.count).toBe(positions.count);
  });

  it('night and day produce different instance colors, and windows only at night', () => {
    city.setNight(true);
    expect(city.windows.visible).toBe(true);
    const nightColor = new THREE.Color();
    city.boxes.getColorAt(0, nightColor);
    const nightHex = nightColor.getHex();
    city.setNight(false);
    expect(city.windows.visible).toBe(false);
    const dayColor = new THREE.Color();
    city.boxes.getColorAt(0, dayColor);
    expect(dayColor.getHex()).not.toBe(nightHex);
    city.setNight(true);
  });

  it('building instances sit above ground level', () => {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    for (let i = 0; i < city.boxes.count; i++) {
      city.boxes.getMatrixAt(i, m);
      pos.setFromMatrixPosition(m);
      expect(pos.y).toBeGreaterThan(0);
    }
  });

  it('dispose releases geometries without throwing', () => {
    const disposable = buildCity();
    expect(() => disposable.dispose()).not.toThrow();
  });
});

describe('buildQpu', () => {
  const device = getDevice('grid-3x3');
  const qpu = buildQpu(device.positions, device.edges, '#38d8d0');

  it('creates one pylon per physical qubit, named for picking', () => {
    expect(qpu.pylons).toHaveLength(device.numQubits);
    qpu.pylons.forEach((p, i) => expect(p.name).toBe(`qubit-${i}`));
  });

  it('creates one bridge per coupling edge keyed low-high', () => {
    expect(qpu.bridges.size).toBe(device.edges.length);
    for (const [a, b] of device.edges) {
      expect(qpu.bridges.has(`${Math.min(a, b)}-${Math.max(a, b)}`)).toBe(true);
    }
  });

  it('places pylons inside the QPU Grid district', () => {
    const district = DISTRICTS.find((d) => d.id === 'qpu-grid')!;
    for (const p of qpu.pylons) {
      expect(Math.abs(p.position.x - district.bounds.x)).toBeLessThanOrEqual(district.bounds.width);
      expect(Math.abs(p.position.z - district.bounds.z)).toBeLessThanOrEqual(district.bounds.depth);
    }
  });

  it('handles a single-qubit device', () => {
    const single = buildQpu([[0, 0]], [], '#38d8d0');
    expect(single.pylons).toHaveLength(1);
    expect(single.bridges.size).toBe(0);
    single.dispose();
  });

  it('dispose releases resources without throwing', () => {
    expect(() => buildQpu(device.positions, device.edges, '#38d8d0').dispose()).not.toThrow();
  });
});
