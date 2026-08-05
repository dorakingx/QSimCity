import { describe, expect, it } from 'vitest';
import {
  doorPosition,
  INTERIOR_BUILDING_IDS,
  interiorCollisionBoxes,
  INTERIORS,
} from '../src/interiors.js';
import { INTERACTIVES } from '../src/interactives.js';
import { generateBuildings } from '../src/buildings.js';

/**
 * Enterable interiors (W1.8): three rooms exist, each inside a real
 * landmark, with its console inside the room and a genuinely passable
 * doorway through the collision walls.
 */

describe('interiors', () => {
  it('defines at least three interiors bound to real buildings', () => {
    expect(INTERIORS.length).toBeGreaterThanOrEqual(3);
    const buildings = generateBuildings();
    for (const [buildingId, interiorId] of Object.entries(INTERIOR_BUILDING_IDS)) {
      expect(
        buildings.some((b) => b.id === buildingId),
        buildingId,
      ).toBe(true);
      expect(
        INTERIORS.some((i) => i.id === interiorId),
        interiorId,
      ).toBe(true);
    }
  });

  it('places each interior console inside its room (W1.8)', () => {
    for (const interior of INTERIORS) {
      const console = INTERACTIVES.find((i) => i.id === interior.consoleId);
      expect(console, interior.id).toBeDefined();
      const dx = Math.abs(console!.position[0] - interior.center[0]);
      const dz = Math.abs(console!.position[1] - interior.center[1]);
      expect(dx, `${interior.id} console x`).toBeLessThan(interior.halfW - 0.5);
      expect(dz, `${interior.id} console z`).toBeLessThan(interior.halfD - 0.5);
    }
  });

  it('keeps the console clear of furniture', () => {
    for (const interior of INTERIORS) {
      const console = INTERACTIVES.find((i) => i.id === interior.consoleId)!;
      const rx = console.position[0] - interior.center[0];
      const rz = console.position[1] - interior.center[1];
      for (const piece of interior.furniture) {
        const overlap =
          Math.abs(rx - piece.offset[0]) < piece.size[0] / 2 + 0.7 &&
          Math.abs(rz - piece.offset[1]) < piece.size[2] / 2 + 0.7;
        expect(overlap, `${interior.id} console vs ${piece.kind}`).toBe(false);
      }
    }
  });

  it('opens a passable doorway: walking through the door hits no wall', () => {
    for (const interior of INTERIORS) {
      const walls = interiorCollisionBoxes(interior).slice(0, 5);
      const door = doorPosition(interior);
      // Sample a straight path through the door into the room center.
      for (let t = 0; t <= 1; t += 0.1) {
        const x = door.x + (interior.center[0] - door.x) * t;
        const z = door.z + (interior.center[1] - door.z) * t;
        for (const wall of walls) {
          const inside = x > wall.minX && x < wall.maxX && z > wall.minZ && z < wall.maxZ;
          expect(inside, `${interior.id} door path blocked at t=${t}`).toBe(false);
        }
      }
    }
  });

  it('surrounds the room with walls everywhere except the door', () => {
    for (const interior of INTERIORS) {
      const walls = interiorCollisionBoxes(interior).slice(0, 5);
      expect(walls).toHaveLength(5);
      const [cx, cz] = interior.center;
      // Probe points just outside each wall side toward the center: all
      // blocked except along the door axis.
      const probes: { x: number; z: number; side: string }[] = [
        { x: cx, z: cz - interior.halfD - 0.5, side: 'north' },
        { x: cx, z: cz + interior.halfD + 0.5, side: 'south' },
        { x: cx + interior.halfW + 0.5, z: cz, side: 'east' },
        { x: cx - interior.halfW - 0.5, z: cz, side: 'west' },
      ];
      for (const probe of probes) {
        const blocked = walls.some(
          (w) => probe.x > w.minX && probe.x < w.maxX && probe.z > w.minZ && probe.z < w.maxZ,
        );
        expect(blocked, `${interior.id} ${probe.side}`).toBe(probe.side !== interior.doorSide);
      }
    }
  });

  it('keeps furniture inside the room bounds', () => {
    for (const interior of INTERIORS) {
      for (const piece of interior.furniture) {
        expect(Math.abs(piece.offset[0]) + piece.size[0] / 2, interior.id).toBeLessThanOrEqual(
          interior.halfW + 1.6,
        );
        expect(Math.abs(piece.offset[1]) + piece.size[2] / 2, interior.id).toBeLessThanOrEqual(
          interior.halfD + 1.6,
        );
      }
    }
  });
});
