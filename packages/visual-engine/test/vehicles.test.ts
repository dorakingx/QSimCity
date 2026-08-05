import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { PedestrianState, VehicleState } from '@qsimcity/world';
import { buildVehicles } from '../src/vehicles.js';

/**
 * Vehicle fleet rendering contracts: the fleet draws exactly the states it
 * is given (pure world derivations), smooths the convoy visually, and
 * switches headlights with the time of day.
 */

function car(id: string, x: number, z: number, kind: VehicleState['kind']): VehicleState {
  return { kind, id, position: { x, z }, heading: 0.5 };
}

function walker(id: string, x: number, z: number): PedestrianState {
  return { id, position: { x, z }, heading: 1 };
}

describe('buildVehicles', () => {
  it('shows the convoy at its semantic position and hides it without one', () => {
    const fleet = buildVehicles();
    const convoy = fleet.group.getObjectByName('job-convoy')!;
    expect(convoy.visible).toBe(false);
    fleet.setSemantic(car('convoy', 10, 20, 'job-convoy'), []);
    expect(convoy.visible).toBe(true);
    // First placement snaps to the target.
    expect(convoy.position.x).toBeCloseTo(10, 3);
    expect(convoy.position.z).toBeCloseTo(20, 3);
    fleet.setSemantic(null, []);
    expect(convoy.visible).toBe(false);
    fleet.dispose();
  });

  it('smooths convoy motion per frame and snaps under reduced motion', () => {
    const fleet = buildVehicles();
    fleet.setSemantic(car('convoy', 0, 0, 'job-convoy'), []);
    fleet.setSemantic(car('convoy', 100, 0, 'job-convoy'), []);
    const convoy = fleet.group.getObjectByName('job-convoy')!;
    fleet.update(0.016, [], [], false);
    expect(convoy.position.x).toBeGreaterThan(0);
    expect(convoy.position.x).toBeLessThan(100);
    fleet.update(0.016, [], [], true);
    expect(convoy.position.x).toBeCloseTo(100, 3);
    fleet.dispose();
  });

  it('draws exactly the courier, ambient, and pedestrian states given', () => {
    const fleet = buildVehicles();
    fleet.setSemantic(null, [car('c1', 5, 5, 'courier'), car('c2', 8, 8, 'courier')]);
    const courierBodies = fleet.group.getObjectByName('courier-bodies') as THREE.InstancedMesh;
    expect(courierBodies.count).toBe(2);
    fleet.update(
      0.016,
      [
        car('a1', 0, 0, 'ambient-car'),
        car('a2', 4, 0, 'ambient-car'),
        car('a3', 8, 0, 'ambient-car'),
      ],
      [walker('p1', 1, 1), walker('p2', 2, 2)],
      false,
    );
    const ambient = fleet.group.getObjectByName('ambient-car-bodies') as THREE.InstancedMesh;
    const pedestrians = fleet.group.getObjectByName('pedestrian-bodies') as THREE.InstancedMesh;
    expect(ambient.count).toBe(3);
    expect(pedestrians.count).toBe(2);
    // Empty states clear the instances.
    fleet.update(0.016, [], [], false);
    expect(ambient.count).toBe(0);
    expect(pedestrians.count).toBe(0);
    fleet.dispose();
  });

  it('switches headlights with the time of day', () => {
    const fleet = buildVehicles();
    const headlights = fleet.group.getObjectByName('ambient-car-headlights') as THREE.InstancedMesh;
    const material = headlights.material as THREE.MeshBasicMaterial;
    fleet.applyTimeOfDay('day');
    expect(material.opacity).toBe(0);
    fleet.applyTimeOfDay('night');
    expect(material.opacity).toBeGreaterThan(0.8);
    fleet.applyTimeOfDay('golden');
    expect(material.opacity).toBeGreaterThan(0.2);
    fleet.dispose();
  });

  it('caps instance counts at capacity without throwing', () => {
    const fleet = buildVehicles();
    const many = Array.from({ length: 200 }, (_, i) => car(`x${i}`, i, 0, 'ambient-car'));
    const crowd = Array.from({ length: 300 }, (_, i) => walker(`w${i}`, i, 0));
    expect(() => fleet.update(0.016, many, crowd, false)).not.toThrow();
    const ambient = fleet.group.getObjectByName('ambient-car-bodies') as THREE.InstancedMesh;
    expect(ambient.count).toBeLessThanOrEqual(24);
    fleet.dispose();
  });
});
