import { DISTRICTS, type District, type DistrictId } from './districts.js';

/**
 * Deterministic procedural building plan. Each district has an architectural
 * kit (part vocabulary) and one landmark composition so districts read
 * differently at skyline, street, and walking distances. The plan is pure
 * data; the visual engine interprets part kinds into geometry.
 */

export type PartKind =
  | 'block' // rectangular building mass
  | 'tower' // tall mass
  | 'cylinder' // tank / silo / dome base
  | 'dome'
  | 'chimney'
  | 'crane'
  | 'mast' // antenna / weather mast
  | 'pylon' // qubit pylon
  | 'bridge' // coupling bridge / conduit
  | 'platform' // low slab
  | 'container'
  | 'ship'
  | 'dish'; // radar / observatory dish

export interface BuildingPart {
  readonly kind: PartKind;
  /** Offset from building origin, world units; y is base height. */
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotationY: number;
  /** 0 = neutral body color, 1 = district accent, 2 = emissive accent. */
  readonly tone: 0 | 1 | 2;
}

export interface Building {
  readonly id: string;
  readonly districtId: DistrictId;
  readonly name: string;
  /** World position of the building origin. */
  readonly position: readonly [number, number];
  readonly rotationY: number;
  readonly parts: readonly BuildingPart[];
  readonly isLandmark: boolean;
  /** Approximate AABB half-extents for collision, from origin. */
  readonly collisionHalfExtents: readonly [number, number];
  readonly collisionHeight: number;
}

/** Small deterministic hash-based value in [0,1) for procedural variety. */
function jitter(seedText: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 8) & 0xffff) / 0x10000;
}

function part(
  kind: PartKind,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  tone: 0 | 1 | 2 = 0,
  rotationY = 0,
): BuildingPart {
  return { kind, offset, size, rotationY, tone };
}

interface KitBuilder {
  landmark(d: District): { name: string; parts: BuildingPart[]; extent: [number, number]; height: number };
  filler(d: District, i: number, r: number): { parts: BuildingPart[]; extent: [number, number]; height: number };
  fillerCount: number;
}

const KITS: Record<DistrictId, KitBuilder> = {
  'program-port': {
    fillerCount: 7,
    landmark: () => ({
      name: 'Harbor Gate Terminal',
      parts: [
        part('block', [0, 0, 0], [16, 7, 10], 0),
        part('block', [0, 7, 0], [12, 3, 8], 1),
        part('crane', [10, 0, 3], [1.6, 16, 12], 1),
        part('ship', [0, 0, 14], [18, 3.5, 6], 2),
      ],
      extent: [12, 9],
      height: 10,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('block', [0, 0, 0], [8 + r * 5, 4 + r * 3, 7], 0),
        part('container', [2, 4 + r * 3, 0], [3, 1.6, 2.2], 1),
      ],
      extent: [6.5, 4.5],
      height: 7 + r * 3,
    }),
  },
  'ir-foundry': {
    fillerCount: 6,
    landmark: () => ({
      name: 'Normalization Furnace',
      parts: [
        part('block', [0, 0, 0], [14, 9, 12], 0),
        part('chimney', [-4, 9, -3], [1.8, 10, 1.8], 1),
        part('chimney', [0, 9, -3], [1.8, 13, 1.8], 1),
        part('chimney', [4, 9, -3], [1.8, 8, 1.8], 1),
        part('block', [0, 9, 3], [10, 2.5, 4], 2),
      ],
      extent: [8, 7],
      height: 22,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('block', [0, 0, 0], [7, 5 + r * 2, 9], 0),
        part('chimney', [2, 5 + r * 2, 2], [1.2, 4 + r * 4, 1.2], 1),
      ],
      extent: [4.5, 5.5],
      height: 9 + r * 5,
    }),
  },
  'layout-exchange': {
    fillerCount: 6,
    landmark: () => ({
      name: 'Assignment Hall',
      parts: [
        part('block', [0, 0, 0], [13, 6, 13], 0),
        part('tower', [-3.5, 6, -3.5], [4, 9, 4], 1),
        part('tower', [3.5, 6, 3.5], [4, 12, 4], 1),
        part('bridge', [0, 12, 0], [10, 1, 2], 2, Math.PI / 4),
      ],
      extent: [8, 8],
      height: 18,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('tower', [0, 0, 0], [5, 8 + r * 6, 5], 0),
        part('block', [0, 8 + r * 6, 0], [5.5, 1, 5.5], 1),
      ],
      extent: [3.5, 3.5],
      height: 9 + r * 6,
    }),
  },
  'routing-transit': {
    fillerCount: 6,
    landmark: () => ({
      name: 'Interchange Yard',
      parts: [
        part('platform', [0, 0, 0], [20, 1.2, 14], 0),
        part('block', [-6, 1.2, -4], [6, 5, 4], 0),
        part('tower', [7, 1.2, -4], [2.5, 11, 2.5], 1),
        part('bridge', [0, 8, 0], [18, 0.8, 1.6], 2),
        part('bridge', [0, 6, 3], [18, 0.8, 1.6], 2),
      ],
      extent: [11, 8],
      height: 12,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('platform', [0, 0, 0], [10, 1, 6], 0),
        part('block', [0, 1, 0], [4, 3.5 + r * 2, 3.5], 0),
        part('mast', [3, 1, 2], [0.6, 6 + r * 3, 0.6], 1),
      ],
      extent: [5.5, 3.5],
      height: 7 + r * 3,
    }),
  },
  'translation-refinery': {
    fillerCount: 6,
    landmark: () => ({
      name: 'Basis Cracking Column',
      parts: [
        part('cylinder', [-4, 0, 0], [3.5, 16, 3.5], 1),
        part('cylinder', [1, 0, 2], [2.6, 11, 2.6], 0),
        part('cylinder', [5, 0, -2], [2.2, 8, 2.2], 0),
        part('bridge', [0, 9, 0], [10, 0.7, 1.2], 2, 0.3),
        part('block', [0, 0, -6], [10, 4, 5], 0),
      ],
      extent: [8, 8],
      height: 16,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('cylinder', [0, 0, 0], [2.2 + r, 6 + r * 4, 2.2 + r], 0),
        part('bridge', [2, 4, 0], [4, 0.5, 0.9], 1),
      ],
      extent: [3.5, 3],
      height: 6 + r * 4,
    }),
  },
  'optimization-works': {
    fillerCount: 5,
    landmark: () => ({
      name: 'Cancellation Mill',
      parts: [
        part('block', [0, 0, 0], [14, 7, 10], 0),
        part('cylinder', [-4, 7, 0], [3, 2.2, 3], 2, Math.PI / 2),
        part('cylinder', [1, 7, 0], [2.4, 2.2, 2.4], 1, Math.PI / 2),
        part('cylinder', [5, 7, 0], [1.8, 2.2, 1.8], 2, Math.PI / 2),
      ],
      extent: [8, 6],
      height: 10,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('block', [0, 0, 0], [8, 4.5 + r * 2, 7], 0),
        part('cylinder', [0, 4.5 + r * 2, 0], [1.6, 1.4, 1.6], 1, Math.PI / 2),
      ],
      extent: [5, 4.5],
      height: 6 + r * 2,
    }),
  },
  'scheduling-tower': {
    fillerCount: 4,
    landmark: () => ({
      name: 'Chronarch Tower',
      parts: [
        part('tower', [0, 0, 0], [7, 26, 7], 0),
        part('block', [0, 26, 0], [9, 3, 9], 1),
        part('cylinder', [0, 29, 0], [3.4, 1.2, 3.4], 2),
        part('mast', [0, 30.2, 0], [0.5, 6, 0.5], 2),
      ],
      extent: [5, 5],
      height: 36,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('block', [0, 0, 0], [6, 6 + r * 5, 6], 0),
        part('mast', [2, 6 + r * 5, 2], [0.4, 3, 0.4], 1),
      ],
      extent: [4, 4],
      height: 9 + r * 5,
    }),
  },
  'qpu-grid': {
    fillerCount: 0, // pylons are generated from the device topology
    landmark: () => ({
      name: 'Cryostat Core',
      parts: [
        part('cylinder', [0, 0, 0], [9, 4, 9], 0),
        part('cylinder', [0, 4, 0], [7, 3.5, 7], 1),
        part('cylinder', [0, 7.5, 0], [5, 3, 5], 0),
        part('cylinder', [0, 10.5, 0], [3, 2.5, 3], 2),
      ],
      extent: [9, 9],
      height: 13,
    }),
    filler: () => ({ parts: [], extent: [1, 1], height: 0 }),
  },
  'noise-atmosphere': {
    fillerCount: 5,
    landmark: () => ({
      name: 'Decoherence Watch',
      parts: [
        part('block', [0, 0, 0], [9, 5, 9], 0),
        part('mast', [0, 5, 0], [0.8, 14, 0.8], 0),
        part('dish', [0, 17, 0], [5, 2.5, 5], 1),
        part('mast', [-3, 5, 3], [0.5, 8, 0.5], 1),
      ],
      extent: [6, 6],
      height: 20,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('block', [0, 0, 0], [5, 3.5, 5], 0),
        part('mast', [0, 3.5, 0], [0.5, 5 + r * 5, 0.5], 1),
        part('dish', [0, 8.5 + r * 5, 0], [2, 1.2, 2], 2),
      ],
      extent: [3.5, 3.5],
      height: 10 + r * 5,
    }),
  },
  'measurement-harbor': {
    fillerCount: 7,
    landmark: () => ({
      name: 'Readout Gantry',
      parts: [
        part('crane', [-5, 0, 0], [2, 18, 14], 1),
        part('platform', [2, 0, 0], [14, 1, 12], 0),
        part('container', [0, 1, -3], [3.2, 1.8, 2.4], 2),
        part('container', [0, 2.8, -3], [3.2, 1.8, 2.4], 1),
        part('container', [4, 1, 1], [3.2, 1.8, 2.4], 1),
      ],
      extent: [10, 8],
      height: 18,
    }),
    filler: (_d, _i, _r) => ({
      parts: [
        part('platform', [0, 0, 0], [8, 0.8, 6], 0),
        part('container', [-1.5, 0.8, 0], [3, 1.7, 2.3], 1),
        part('container', [1.8, 0.8, 0.5], [3, 1.7, 2.3], 0),
        part('container', [0, 2.5, 0.2], [3, 1.7, 2.3], 2),
      ],
      extent: [4.5, 3.5],
      height: 4.5,
    }),
  },
  'classical-control': {
    fillerCount: 5,
    landmark: () => ({
      name: 'Feedback Nexus',
      parts: [
        part('block', [0, 0, 0], [10, 8, 10], 0),
        part('tower', [0, 8, 0], [5, 8, 5], 1),
        part('bridge', [8, 12, 0], [12, 0.8, 1.4], 2),
        part('bridge', [-8, 10, 0], [12, 0.8, 1.4], 2),
      ],
      extent: [7, 6],
      height: 16,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('block', [0, 0, 0], [6, 5 + r * 4, 6], 0),
        part('bridge', [4, 4 + r * 3, 0], [6, 0.6, 1.1], 1),
      ],
      extent: [4, 4],
      height: 8 + r * 4,
    }),
  },
  observatory: {
    fillerCount: 4,
    landmark: () => ({
      name: 'Provenance Dome',
      parts: [
        part('cylinder', [0, 0, 0], [10, 5, 10], 0),
        part('dome', [0, 5, 0], [8, 6, 8], 1),
        part('block', [11, 0, 0], [8, 3.5, 6], 0),
        part('dish', [14, 3.5, 0], [3, 1.6, 3], 2),
      ],
      extent: [13, 8],
      height: 11,
    }),
    filler: (d, i, r) => ({
      parts: [
        part('block', [0, 0, 0], [7, 3 + r * 2, 5], 0),
        part('dome', [0, 3 + r * 2, 0], [2.5, 2, 2.5], 1),
      ],
      extent: [4.5, 3.5],
      height: 6 + r * 2,
    }),
  },
};

/**
 * Global building scale. The district plates are sized for legibility from
 * the skyline camera; the architectural kits are authored at human scale, so
 * they are scaled up here to fill their districts and form a readable
 * silhouette. Collision extents scale with the geometry.
 */
const BUILDING_SCALE = 2.0;

function scalePart(part: BuildingPart): BuildingPart {
  return {
    ...part,
    offset: [
      part.offset[0] * BUILDING_SCALE,
      part.offset[1] * BUILDING_SCALE,
      part.offset[2] * BUILDING_SCALE,
    ],
    size: [
      part.size[0] * BUILDING_SCALE,
      part.size[1] * BUILDING_SCALE,
      part.size[2] * BUILDING_SCALE,
    ],
  };
}

/** Deterministic full building plan for the city. */
export function generateBuildings(): Building[] {
  const buildings: Building[] = [];
  for (const district of DISTRICTS) {
    const kit = KITS[district.id];
    const landmark = kit.landmark(district);
    buildings.push({
      id: `${district.id}-landmark`,
      districtId: district.id,
      name: landmark.name,
      position: [district.bounds.x, district.bounds.z],
      rotationY: 0,
      parts: landmark.parts.map(scalePart),
      isLandmark: true,
      collisionHalfExtents: [
        landmark.extent[0] * BUILDING_SCALE,
        landmark.extent[1] * BUILDING_SCALE,
      ],
      collisionHeight: landmark.height * BUILDING_SCALE,
    });
    // Fillers ring the landmark on a deterministic spiral.
    for (let i = 0; i < kit.fillerCount; i++) {
      const r = jitter(`${district.id}-${i}`);
      const angle = (i / kit.fillerCount) * Math.PI * 2 + r * 0.8;
      const radius =
        Math.min(district.bounds.width, district.bounds.depth) * 0.34 + r * 5 + 14;
      const x = district.bounds.x + Math.cos(angle) * radius;
      const z = district.bounds.z + Math.sin(angle) * radius * 0.75;
      const spec = kit.filler(district, i, r);
      if (spec.parts.length === 0) continue;
      buildings.push({
        id: `${district.id}-b${i}`,
        districtId: district.id,
        name: `${district.name} block ${i + 1}`,
        position: [x, z],
        rotationY: r * Math.PI * 2,
        parts: spec.parts.map(scalePart),
        isLandmark: false,
        collisionHalfExtents: [
          spec.extent[0] * BUILDING_SCALE,
          spec.extent[1] * BUILDING_SCALE,
        ],
        collisionHeight: spec.height * BUILDING_SCALE,
      });
    }
  }
  return buildings;
}

/**
 * QPU pylon positions for a device topology, laid out inside the QPU Grid
 * district from the device's own 2D positions.
 */
export function qpuPylonPositions(
  devicePositions: readonly (readonly [number, number])[],
): [number, number][] {
  const district = DISTRICTS.find((d) => d.id === 'qpu-grid')!;
  if (devicePositions.length === 0) return [];
  const xs = devicePositions.map((p) => p[0]);
  const ys = devicePositions.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const usableW = district.bounds.width * 0.7;
  const usableD = district.bounds.depth * 0.7;
  return devicePositions.map(([px, py]) => [
    district.bounds.x + ((px - minX) / spanX - 0.5) * usableW,
    district.bounds.z + ((py - minY) / spanY - 0.5) * usableD,
  ]);
}
