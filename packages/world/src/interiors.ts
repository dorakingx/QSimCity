import type { DistrictId } from './districts.js';
import { LANDMARK_SITES } from './landmarks.js';
import type { RoadRect } from './roads.js';

/**
 * Enterable interiors (spec §2.3, W1.8): selected landmark ground floors are
 * hollow, with a real doorway, a furnished room, and the district's console
 * inside. This module is the single source for door openings, interior
 * furniture, and the wall-segment collision boxes that let a walker step
 * through the door but not through walls.
 */

export type DoorSide = 'north' | 'south' | 'east' | 'west';

export interface InteriorFurniture {
  /** Box furniture piece, positioned relative to the room center. */
  readonly kind: 'desk' | 'screen' | 'table' | 'shelf' | 'exhibit';
  readonly offset: readonly [number, number];
  readonly size: readonly [number, number, number];
  readonly rotationY: number;
}

export interface Interior {
  readonly id: string;
  readonly districtId: DistrictId;
  readonly name: string;
  /** Room center in world coordinates. */
  readonly center: readonly [number, number];
  /** Interior room half extents (inside the walls). */
  readonly halfW: number;
  readonly halfD: number;
  /** Room height. */
  readonly height: number;
  /** Which wall carries the doorway. */
  readonly doorSide: DoorSide;
  /** Door width in meters. */
  readonly doorWidth: number;
  readonly furniture: readonly InteriorFurniture[];
  /** The interactive console that lives inside this room. */
  readonly consoleId: string;
}

function furnish(
  kind: InteriorFurniture['kind'],
  offset: readonly [number, number],
  size: readonly [number, number, number],
  rotationY = 0,
): InteriorFurniture {
  return { kind, offset, size, rotationY };
}

/**
 * Three furnished, enterable rooms. Centers derive from the landmark
 * anchors so the rooms sit exactly inside their buildings' ground floors.
 */
export const INTERIORS: readonly Interior[] = [
  {
    id: 'interior-exchange-hall',
    districtId: 'layout-exchange',
    name: 'Assignment Hall Trading Floor',
    center: [
      LANDMARK_SITES['layout-exchange'].anchor[0],
      LANDMARK_SITES['layout-exchange'].anchor[1],
    ],
    halfW: 11,
    halfD: 11,
    height: 10,
    doorSide: 'north',
    doorWidth: 5,
    furniture: [
      furnish('desk', [-6, -4], [4.4, 1.1, 1.6]),
      furnish('desk', [0, -4], [4.4, 1.1, 1.6]),
      furnish('desk', [6, -4], [4.4, 1.1, 1.6]),
      furnish('screen', [0, 9.5], [12, 4.5, 0.4]),
      furnish('table', [0, 2], [3.2, 0.9, 3.2]),
      furnish('shelf', [-9.8, 4], [0.7, 2.6, 6], 0),
    ],
    consoleId: 'exchange-layout-desk',
  },
  {
    id: 'interior-port-terminal',
    districtId: 'program-port',
    name: 'Harbor Gate Terminal Lobby',
    center: [LANDMARK_SITES['program-port'].anchor[0], LANDMARK_SITES['program-port'].anchor[1]],
    halfW: 13,
    halfD: 7.5,
    height: 11,
    doorSide: 'south',
    doorWidth: 6,
    furniture: [
      furnish('desk', [-8, -3.5], [5, 1.15, 1.8]),
      furnish('desk', [8, -3.5], [5, 1.15, 1.8]),
      furnish('screen', [0, -6.6], [14, 4, 0.4]),
      furnish('exhibit', [-4, 2], [2.2, 1.4, 2.2]),
      furnish('exhibit', [4, 2], [2.2, 1.4, 2.2]),
    ],
    consoleId: 'port-intake-desk',
  },
  {
    id: 'interior-observatory',
    districtId: 'observatory',
    name: 'Provenance Dome Gallery',
    center: [LANDMARK_SITES.observatory.anchor[0], LANDMARK_SITES.observatory.anchor[1]],
    halfW: 8,
    halfD: 8,
    height: 8,
    doorSide: 'east',
    doorWidth: 4.5,
    furniture: [
      furnish('exhibit', [-4, -4], [2, 1.3, 2]),
      furnish('exhibit', [4, -4], [2, 1.3, 2]),
      furnish('exhibit', [-4, 4], [2, 1.3, 2]),
      furnish('screen', [-7, 0], [0.4, 3.6, 9], 0),
      furnish('table', [0, 0], [2.8, 0.95, 2.8]),
    ],
    consoleId: 'observatory-lectern',
  },
];

/** Ids of buildings whose ground floor is hollowed by an interior. */
export const INTERIOR_BUILDING_IDS: Record<string, string> = {
  'layout-exchange-landmark': 'interior-exchange-hall',
  'program-port-landmark': 'interior-port-terminal',
  'observatory-landmark': 'interior-observatory',
};

/**
 * Wall-segment collision boxes for an interior: four walls with a gap on
 * the door side. Walkers collide with these instead of the whole-building
 * box, so the doorway is genuinely passable (W1.8).
 */
export function interiorCollisionBoxes(interior: Interior): RoadRect[] {
  const [cx, cz] = interior.center;
  const t = 1.2; // wall thickness
  const { halfW, halfD, doorWidth, doorSide } = interior;
  const boxes: RoadRect[] = [];
  const wall = (minX: number, maxX: number, minZ: number, maxZ: number): void => {
    boxes.push({ minX, maxX, minZ, maxZ });
  };
  const half = doorWidth / 2;
  // North wall (-z side).
  if (doorSide === 'north') {
    wall(cx - halfW - t, cx - half, cz - halfD - t, cz - halfD);
    wall(cx + half, cx + halfW + t, cz - halfD - t, cz - halfD);
  } else {
    wall(cx - halfW - t, cx + halfW + t, cz - halfD - t, cz - halfD);
  }
  // South wall (+z side).
  if (doorSide === 'south') {
    wall(cx - halfW - t, cx - half, cz + halfD, cz + halfD + t);
    wall(cx + half, cx + halfW + t, cz + halfD, cz + halfD + t);
  } else {
    wall(cx - halfW - t, cx + halfW + t, cz + halfD, cz + halfD + t);
  }
  // West wall (-x side).
  if (doorSide === 'west') {
    wall(cx - halfW - t, cx - halfW, cz - halfD, cz - half);
    wall(cx - halfW - t, cx - halfW, cz + half, cz + halfD);
  } else {
    wall(cx - halfW - t, cx - halfW, cz - halfD, cz + halfD);
  }
  // East wall (+x side).
  if (doorSide === 'east') {
    wall(cx + halfW, cx + halfW + t, cz - halfD, cz - half);
    wall(cx + halfW, cx + halfW + t, cz + half, cz + halfD);
  } else {
    wall(cx + halfW, cx + halfW + t, cz - halfD, cz + halfD);
  }
  // Furniture also blocks walking.
  for (const piece of interior.furniture) {
    boxes.push({
      minX: cx + piece.offset[0] - piece.size[0] / 2,
      maxX: cx + piece.offset[0] + piece.size[0] / 2,
      minZ: cz + piece.offset[1] - piece.size[2] / 2,
      maxZ: cz + piece.offset[1] + piece.size[2] / 2,
    });
  }
  return boxes;
}

/** The world-space doorway center, for tests and door props. */
export function doorPosition(interior: Interior): { x: number; z: number } {
  const [cx, cz] = interior.center;
  switch (interior.doorSide) {
    case 'north':
      return { x: cx, z: cz - interior.halfD };
    case 'south':
      return { x: cx, z: cz + interior.halfD };
    case 'east':
      return { x: cx + interior.halfW, z: cz };
    case 'west':
      return { x: cx - interior.halfW, z: cz };
  }
}
