import { DISTRICTS, type District, type DistrictId } from './districts.js';
import { districtPlans, type Parcel } from './blocks.js';
import { hash01, hashPick, hashRange } from './util.js';
import { LANDMARK_SITES } from './landmarks.js';

/**
 * Deterministic procedural architecture (spec §2.3). Buildings are generated
 * per parcel from district-specific massing recipes, so every structure
 * stands on a lot that roads and other lots cannot intersect. Parts carry a
 * facade style consumed by the visual engine's procedural texture atlas.
 * The plan is pure data; the visual engine interprets part kinds into
 * geometry.
 */

export type PartKind =
  | 'block' // rectangular building mass with facade
  | 'tower' // tall mass with facade
  | 'cylinder' // tank / silo / dome base
  | 'dome'
  | 'wedge' // triangular prism: gable and sawtooth roofs
  | 'chimney'
  | 'crane'
  | 'mast' // antenna / weather mast
  | 'pylon' // qubit pylon
  | 'bridge' // coupling bridge / conduit / pipe rack
  | 'platform' // low slab
  | 'container'
  | 'ship'
  | 'dish'; // radar / observatory dish

export type FacadeStyle =
  | 'glass' // curtain-wall office
  | 'panel' // modern panel grid
  | 'concrete' // exposed concrete, punched windows
  | 'brick' // masonry with regular windows
  | 'stone' // civic stone, tall windows
  | 'industrial' // corrugated cladding, high windows
  | 'plain'; // untextured accent surfaces

export interface BuildingPart {
  readonly kind: PartKind;
  /** Offset from building origin, world units; y is base height. */
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotationY: number;
  /** 0 = neutral body color, 1 = district accent, 2 = emissive accent. */
  readonly tone: 0 | 1 | 2;
  /** Facade family for textured parts; undefined parts render untextured. */
  readonly facade?: FacadeStyle;
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

function part(
  kind: PartKind,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  tone: 0 | 1 | 2 = 0,
  rotationY = 0,
  facade?: FacadeStyle,
): BuildingPart {
  return facade !== undefined
    ? { kind, offset, size, rotationY, tone, facade }
    : { kind, offset, size, rotationY, tone };
}

interface Massing {
  readonly parts: BuildingPart[];
  readonly extent: readonly [number, number];
  readonly height: number;
  readonly name: string;
}

const FLOOR = 3.1;

/** Downtown podium-and-tower composition. */
function podiumTower(
  seed: string,
  w: number,
  d: number,
  floors: number,
  facade: FacadeStyle,
): Massing {
  const parts: BuildingPart[] = [];
  const podiumFloors = 2 + Math.round(hash01(`${seed}:pod`) * 2);
  const podiumH = podiumFloors * FLOOR;
  parts.push(part('block', [0, 0, 0], [w, podiumH, d], 0, 0, facade));
  const towerW = w * hashRange(`${seed}:tw`, 0.5, 0.68);
  const towerD = d * hashRange(`${seed}:td`, 0.5, 0.68);
  const towerH = Math.max(2, floors - podiumFloors) * FLOOR;
  const tx = (w - towerW) * hashRange(`${seed}:tx`, -0.18, 0.18);
  const tz = (d - towerD) * hashRange(`${seed}:tz`, -0.18, 0.18);
  parts.push(part('tower', [tx, podiumH, tz], [towerW, towerH, towerD], 0, 0, facade));
  // Rooftop plant and parapet detail.
  parts.push(
    part(
      'block',
      [tx, podiumH + towerH, tz],
      [towerW * 0.4, 2.2, towerD * 0.4],
      0,
      0,
      'industrial',
    ),
  );
  if (hash01(`${seed}:mast`) > 0.6) {
    parts.push(part('mast', [tx, podiumH + towerH + 2.2, tz], [0.4, 4.5, 0.4], 1));
  }
  return {
    parts,
    extent: [w / 2, d / 2],
    height: podiumH + towerH + 2.2,
    name: 'tower',
  };
}

/** Mid-rise slab with parapet and roof plant. */
function officeSlab(
  seed: string,
  w: number,
  d: number,
  floors: number,
  facade: FacadeStyle,
): Massing {
  const h = floors * FLOOR;
  const parts: BuildingPart[] = [
    part('block', [0, 0, 0], [w, h, d], 0, 0, facade),
    part('block', [0, h, 0], [w * 0.98, 0.5, d * 0.98], 0),
  ];
  if (hash01(`${seed}:plant`) > 0.45) {
    const pw = w * 0.3;
    parts.push(
      part(
        'block',
        [w * hashRange(`${seed}:px`, -0.2, 0.2), h + 0.5, d * hashRange(`${seed}:pz`, -0.2, 0.2)],
        [pw, 1.8, pw * 0.8],
        0,
        0,
        'industrial',
      ),
    );
  }
  return { parts, extent: [w / 2, d / 2], height: h + 2.3, name: 'offices' };
}

/** Two or three rowhouse-style masses with varied heights. */
function rowBlocks(seed: string, w: number, d: number, facade: FacadeStyle): Massing {
  const count = w > 16 ? 3 : 2;
  const parts: BuildingPart[] = [];
  let maxH = 0;
  const sliceW = w / count;
  for (let i = 0; i < count; i++) {
    const floors = 2 + Math.round(hash01(`${seed}:r${i}`) * 3);
    const h = floors * FLOOR;
    maxH = Math.max(maxH, h);
    const x = -w / 2 + sliceW * (i + 0.5);
    parts.push(part('block', [x, 0, 0], [sliceW * 0.94, h, d], 0, 0, facade));
    if (hash01(`${seed}:g${i}`) > 0.55) {
      parts.push(part('wedge', [x, h, 0], [sliceW * 0.94, 1.8, d], 0, 0, facade));
    }
  }
  return { parts, extent: [w / 2, d / 2], height: maxH + 1.8, name: 'row buildings' };
}

/** Industrial hall with sawtooth roof and an optional stack. */
function industrialHall(seed: string, w: number, d: number, facade: FacadeStyle): Massing {
  const h = hashRange(`${seed}:h`, 6, 9);
  const parts: BuildingPart[] = [part('block', [0, 0, 0], [w, h, d], 0, 0, facade)];
  const teeth = Math.max(2, Math.round(w / 6));
  const toothW = w / teeth;
  for (let i = 0; i < teeth; i++) {
    parts.push(
      part('wedge', [-w / 2 + toothW * (i + 0.5), h, 0], [toothW, 2.2, d * 0.96], 0, 0, facade),
    );
  }
  if (hash01(`${seed}:stack`) > 0.5) {
    parts.push(
      part('chimney', [w * 0.32, h, d * 0.28], [1.1, hashRange(`${seed}:sh`, 5, 10), 1.1], 1),
    );
  }
  return { parts, extent: [w / 2, d / 2], height: h + 10, name: 'works hall' };
}

/** Tank farm: cylinders and a connecting pipe rack. */
function tankFarm(seed: string, w: number, d: number): Massing {
  const parts: BuildingPart[] = [];
  const count = w > 18 && d > 18 ? 4 : 2;
  const radius = Math.min(w, d) * (count === 4 ? 0.21 : 0.26);
  let maxH = 0;
  for (let i = 0; i < count; i++) {
    const gx = count === 4 ? (i % 2 === 0 ? -1 : 1) : i === 0 ? -1 : 1;
    const gz = count === 4 ? (i < 2 ? -1 : 1) : 0;
    const h = hashRange(`${seed}:t${i}`, 6, 13);
    maxH = Math.max(maxH, h);
    parts.push(
      part(
        'cylinder',
        [gx * w * 0.24, 0, gz * d * 0.24],
        [radius * 2, h, radius * 2],
        i === 0 ? 1 : 0,
      ),
    );
    parts.push(
      part('dome', [gx * w * 0.24, h, gz * d * 0.24], [radius * 2, radius * 0.5, radius * 2], 0),
    );
  }
  parts.push(part('bridge', [0, 4.2, 0], [w * 0.7, 0.5, 0.9], 2));
  return { parts, extent: [w / 2, d / 2], height: maxH + 2, name: 'tank farm' };
}

/** Low warehouse with a gable roof. */
function warehouse(seed: string, w: number, d: number, facade: FacadeStyle): Massing {
  const h = hashRange(`${seed}:h`, 5, 7.5);
  return {
    parts: [
      part('block', [0, 0, 0], [w, h, d], 0, 0, facade),
      part('wedge', [0, h, 0], [w, hashRange(`${seed}:g`, 1.6, 2.6), d], 0, 0, facade),
    ],
    extent: [w / 2, d / 2],
    height: h + 2.6,
    name: 'warehouse',
  };
}

/** Data-center slab with cooling plant rows. */
function dataHall(seed: string, w: number, d: number): Massing {
  const h = hashRange(`${seed}:h`, 8, 12);
  const parts: BuildingPart[] = [part('block', [0, 0, 0], [w, h, d], 0, 0, 'panel')];
  const units = Math.max(2, Math.round(w / 5));
  for (let i = 0; i < units; i++) {
    parts.push(
      part(
        'block',
        [-w / 2 + (w / units) * (i + 0.5), h, d * 0.22],
        [(w / units) * 0.7, 1.6, d * 0.3],
        0,
        0,
        'industrial',
      ),
    );
  }
  parts.push(part('bridge', [0, h * 0.75, -d / 2 - 1.2], [w * 0.5, 0.7, 1.1], 2));
  return { parts, extent: [w / 2, d / 2 + 1.2], height: h + 1.6, name: 'data hall' };
}

/** Pick and build a filler massing for a parcel. */
function fillerFor(district: District, parcel: Parcel, index: number): Massing {
  const seed = `${parcel.id}:m`;
  const rectW = parcel.rect.maxX - parcel.rect.minX;
  const rectD = parcel.rect.maxZ - parcel.rect.minZ;
  const inset = hashRange(`${seed}:inset`, 1.7, 2.8);
  const w = Math.max(7, rectW - inset * 2);
  const d = Math.max(7, rectD - inset * 2);
  void index;
  switch (district.id) {
    case 'program-port':
    case 'measurement-harbor':
      return warehouse(seed, w, d, 'industrial');
    case 'ir-foundry':
      return hash01(`${seed}:pick`) < 0.6
        ? industrialHall(seed, w, d, 'industrial')
        : warehouse(seed, w, d, 'brick');
    case 'translation-refinery':
      return hash01(`${seed}:pick`) < 0.55
        ? tankFarm(seed, w, d)
        : industrialHall(seed, w, d, 'industrial');
    case 'optimization-works':
      return hash01(`${seed}:pick`) < 0.65
        ? industrialHall(seed, w, d, 'industrial')
        : officeSlab(seed, w, d, 3 + Math.round(hash01(`${seed}:f`) * 2), 'concrete');
    case 'layout-exchange': {
      const floors = 5 + Math.round(hash01(`${seed}:f`) * 5);
      return hash01(`${seed}:pick`) < 0.5
        ? officeSlab(
            seed,
            w,
            d,
            floors,
            hashPick(`${seed}:fc`, ['stone', 'glass', 'panel'] as const),
          )
        : podiumTower(seed, w, d, floors + 3, 'glass');
    }
    case 'routing-transit':
      return hash01(`${seed}:pick`) < 0.5
        ? officeSlab(seed, w, d, 3 + Math.round(hash01(`${seed}:f`) * 2), 'concrete')
        : warehouse(seed, w, d, 'industrial');
    case 'scheduling-tower': {
      const floors = 10 + Math.round(hash01(`${seed}:f`) * 16);
      return podiumTower(seed, w, d, floors, hashPick(`${seed}:fc`, ['glass', 'panel'] as const));
    }
    case 'qpu-grid':
      return officeSlab(seed, w, d, 2, 'panel');
    case 'noise-atmosphere': {
      const m = officeSlab(seed, w, d, 2 + Math.round(hash01(`${seed}:f`) * 2), 'concrete');
      m.parts.push(
        part(
          'mast',
          [w * 0.28, m.height - 2.3, d * 0.28],
          [0.5, hashRange(`${seed}:mh`, 6, 11), 0.5],
          1,
        ),
      );
      if (hash01(`${seed}:dish`) > 0.5) {
        m.parts.push(part('dish', [-w * 0.2, m.height - 2.3, -d * 0.2], [2.4, 1.4, 2.4], 2));
      }
      return { ...m, height: m.height + 9, name: 'monitoring station' };
    }
    case 'classical-control':
      return dataHall(seed, w, d);
    case 'observatory':
      return hash01(`${seed}:pick`) < 0.55
        ? rowBlocks(seed, w, d, 'stone')
        : officeSlab(seed, w, d, 2 + Math.round(hash01(`${seed}:f`) * 2), 'stone');
    default:
      return rowBlocks(seed, w, d, 'brick');
  }
}

/** Hand-authored landmark for each district, at meter scale. */
function landmarkFor(district: District): Massing {
  switch (district.id) {
    case 'program-port':
      return {
        name: 'Harbor Gate Terminal',
        parts: [
          part('block', [0, 0, 0], [30, 13, 18], 0, 0, 'stone'),
          part('block', [0, 13, 0], [24, 5, 14], 1, 0, 'glass'),
          part('wedge', [0, 18, 0], [24, 3, 14], 0, 0, 'plain'),
          part('crane', [19, 0, 4], [2.6, 26, 20], 1),
          part('crane', [-19, 0, -4], [2.6, 24, 18], 1),
          part('platform', [0, 0, 14], [34, 1.4, 8], 0),
          part('container', [6, 1.4, 14], [6, 2.6, 2.6], 2),
          part('container', [-4, 1.4, 15], [6, 2.6, 2.6], 1),
        ],
        extent: [21, 18],
        height: 26,
      };
    case 'ir-foundry':
      return {
        name: 'Normalization Furnace',
        parts: [
          part('block', [0, 0, 0], [26, 15, 20], 0, 0, 'brick'),
          part('wedge', [-6.5, 15, 0], [13, 3.4, 19], 0, 0, 'brick'),
          part('wedge', [6.5, 15, 0], [13, 3.4, 19], 0, 0, 'brick'),
          part('chimney', [-8, 15, -6], [2.6, 16, 2.6], 1),
          part('chimney', [0, 15, -6], [2.6, 21, 2.6], 1),
          part('chimney', [8, 15, -6], [2.6, 13, 2.6], 1),
          part('block', [0, 15, 6], [18, 4, 6], 2, 0, 'glass'),
          part('bridge', [14, 8, 0], [8, 1, 1.6], 1),
        ],
        extent: [15, 11],
        height: 36,
      };
    case 'layout-exchange':
      return {
        name: 'Assignment Hall',
        parts: [
          part('block', [0, 0, 0], [26, 12, 26], 0, 0, 'stone'),
          part('tower', [-7, 12, -7], [8, 16, 8], 0, 0, 'glass'),
          part('tower', [7, 12, 7], [8, 22, 8], 1, 0, 'glass'),
          part('bridge', [0, 23, 0], [18, 1.6, 3.2], 2, Math.PI / 4),
          part('block', [0, 12, 0], [12, 2, 12], 0, 0, 'plain'),
          part('dome', [0, 34, 7], [7, 3, 7], 1),
        ],
        extent: [15, 15],
        height: 37,
      };
    case 'routing-transit':
      return {
        name: 'Interchange Yard',
        parts: [
          part('platform', [0, 0, 0], [38, 1.6, 26], 0),
          part('block', [-11, 1.6, -7], [12, 9, 8], 0, 0, 'concrete'),
          part('wedge', [0, 8, 4], [36, 2.4, 7], 0, 0, 'plain'),
          part('block', [0, 6, 4], [36, 2, 6], 0, 0, 'industrial'),
          part('tower', [13, 1.6, -8], [4.4, 17, 4.4], 1, 0, 'glass'),
          part('bridge', [0, 13, 0], [34, 1.4, 2.6], 2),
          part('bridge', [0, 10, 7], [34, 1.4, 2.6], 2),
          part('mast', [-16, 1.6, 6], [0.8, 12, 0.8], 1),
        ],
        extent: [20, 14],
        height: 20,
      };
    case 'translation-refinery':
      return {
        name: 'Basis Cracking Column',
        parts: [
          part('cylinder', [-8, 0, 0], [7, 30, 7], 1),
          part('cylinder', [2, 0, 4], [5.2, 21, 5.2], 0),
          part('cylinder', [10, 0, -4], [4.4, 15, 4.4], 0),
          part('dome', [-8, 30, 0], [7, 2.4, 7], 1),
          part('bridge', [0, 17, 0], [20, 1.2, 2], 2, 0.3),
          part('bridge', [3, 9, 1], [18, 1, 1.6], 1, -0.2),
          part('block', [0, 0, -11], [20, 7, 9], 0, 0, 'industrial'),
          part('chimney', [15, 0, 6], [1.6, 34, 1.6], 2),
        ],
        extent: [16, 14],
        height: 34,
      };
    case 'optimization-works':
      return {
        name: 'Cancellation Mill',
        parts: [
          part('block', [0, 0, 0], [28, 13, 20], 0, 0, 'concrete'),
          part('wedge', [-7, 13, 0], [14, 3, 19], 0, 0, 'plain'),
          part('wedge', [7, 13, 0], [14, 3, 19], 0, 0, 'plain'),
          part('cylinder', [-8, 16, 0], [6, 4.4, 6], 2, Math.PI / 2),
          part('cylinder', [2, 16, 0], [4.8, 4.4, 4.8], 1, Math.PI / 2),
          part('cylinder', [10, 16, 0], [3.6, 4.4, 3.6], 2, Math.PI / 2),
          part('bridge', [0, 8, 12], [22, 1.2, 2], 1),
        ],
        extent: [16, 13],
        height: 21,
      };
    case 'scheduling-tower':
      return {
        name: 'Chronarch Tower',
        parts: [
          part('block', [0, 0, 0], [22, 9, 22], 0, 0, 'stone'),
          part('tower', [0, 9, 0], [13, 62, 13], 0, 0, 'glass'),
          part('block', [0, 71, 0], [17, 5, 17], 1, 0, 'glass'),
          part('cylinder', [0, 76, 0], [6.4, 2.4, 6.4], 2),
          part('mast', [0, 78.4, 0], [0.9, 12, 0.9], 2),
          part('block', [0, 9, 0], [15, 1.2, 15], 0, 0, 'plain'),
        ],
        extent: [11, 11],
        height: 90,
      };
    case 'qpu-grid':
      return {
        name: 'Cryostat Core',
        parts: [
          part('cylinder', [0, 0, -4], [18, 7, 18], 0),
          part('cylinder', [0, 7, -4], [14, 6, 14], 1),
          part('cylinder', [0, 13, -4], [10, 5.4, 10], 0),
          part('cylinder', [0, 18.4, -4], [6, 4.4, 6], 2),
          part('dome', [0, 22.8, -4], [6, 2.6, 6], 2),
          part('block', [0, 0, 10], [10, 3.6, 6], 0, 0, 'panel'),
          part('bridge', [0, 5, 4], [2, 1, 8], 1),
        ],
        extent: [10, 13],
        height: 25,
      };
    case 'noise-atmosphere':
      return {
        name: 'Decoherence Watch',
        parts: [
          part('block', [0, 0, 0], [17, 9, 17], 0, 0, 'concrete'),
          part('mast', [0, 9, 0], [1.5, 24, 1.5], 0),
          part('dish', [0, 33, 0], [10, 5, 10], 1),
          part('mast', [-6, 9, 6], [0.9, 14, 0.9], 1),
          part('dome', [6, 9, -6], [5, 2.6, 5], 2),
          part('block', [0, 9, 0], [9, 1, 9], 0, 0, 'plain'),
        ],
        extent: [9, 9],
        height: 38,
      };
    case 'measurement-harbor':
      return {
        name: 'Readout Gantry',
        parts: [
          part('crane', [-9, 0, 0], [3.4, 30, 26], 1),
          part('platform', [4, 0, 0], [28, 1.6, 24], 0),
          part('container', [0, 1.6, -6], [6.2, 3, 4.4], 2),
          part('container', [0, 4.6, -6], [6.2, 3, 4.4], 1),
          part('container', [8, 1.6, 2], [6.2, 3, 4.4], 1),
          part('container', [8, 1.6, 8], [6.2, 3, 4.4], 0),
          part('block', [-2, 1.6, 9], [10, 6, 6], 0, 0, 'industrial'),
        ],
        extent: [19, 14],
        height: 30,
      };
    case 'classical-control':
      return {
        name: 'Feedback Nexus',
        parts: [
          part('block', [0, 0, 0], [20, 14, 20], 0, 0, 'panel'),
          part('tower', [0, 14, 0], [10, 14, 10], 1, 0, 'glass'),
          part('bridge', [16, 21, 0], [22, 1.4, 2.4], 2),
          part('bridge', [-16, 17, 0], [22, 1.4, 2.4], 2),
          part('block', [0, 28, 0], [6, 2, 6], 0, 0, 'industrial'),
          part('mast', [0, 30, 0], [0.6, 6, 0.6], 2),
        ],
        extent: [14, 10],
        height: 36,
      };
    case 'observatory':
      return {
        name: 'Provenance Dome',
        parts: [
          part('cylinder', [0, 0, 0], [19, 9, 19], 0),
          part('dome', [0, 9, 0], [15, 11, 15], 1),
          part('block', [18, 0, 0], [13, 6, 11], 0, 0, 'stone'),
          part('dish', [23, 6, 0], [6, 3.2, 6], 2),
          part('platform', [0, 0, 11], [30, 1, 6], 0),
          part('mast', [-10, 0, 12], [0.6, 7, 0.6], 1),
        ],
        extent: [25, 14],
        height: 20,
      };
  }
}

/** Simple anchor-distance sort key for landmark block reservation. */
function distanceToAnchor(parcel: Parcel, anchor: readonly [number, number]): number {
  const cx = (parcel.rect.minX + parcel.rect.maxX) / 2;
  const cz = (parcel.rect.minZ + parcel.rect.maxZ) / 2;
  return Math.hypot(cx - anchor[0], cz - anchor[1]);
}

let cachedBuildings: Building[] | null = null;

/** Deterministic full building plan for the city. */
export function generateBuildings(): Building[] {
  if (cachedBuildings) return cachedBuildings.map((b) => b);
  const buildings: Building[] = [];
  const plans = districtPlans();
  for (const district of DISTRICTS) {
    const plan = plans.find((p) => p.districtId === district.id)!;
    const landmark = landmarkFor(district);
    // The landmark stands at its road-clear anchor; the closest block's
    // parcels are reserved for it.
    const anchor = LANDMARK_SITES[district.id].anchor;
    const buildingParcels = plan.parcels.filter((p) => p.usage === 'building');
    const sorted = [...buildingParcels].sort(
      (a, b) => distanceToAnchor(a, anchor) - distanceToAnchor(b, anchor),
    );
    const landmarkParcel = sorted[0];
    const landmarkBlockId = landmarkParcel?.blockId;
    const landmarkX = anchor[0];
    const landmarkZ = anchor[1];
    buildings.push({
      id: `${district.id}-landmark`,
      districtId: district.id,
      name: landmark.name,
      position: [landmarkX, landmarkZ],
      rotationY: 0,
      parts: landmark.parts,
      isLandmark: true,
      collisionHalfExtents: landmark.extent,
      collisionHeight: landmark.height,
    });
    // The QPU campus keeps its grounds open for the pylon field.
    if (district.id === 'qpu-grid') continue;
    let index = 0;
    for (const parcel of buildingParcels) {
      if (parcel.blockId === landmarkBlockId) continue;
      // Skip parcels whose building envelope could touch the landmark.
      const cx = (parcel.rect.minX + parcel.rect.maxX) / 2;
      const cz = (parcel.rect.minZ + parcel.rect.maxZ) / 2;
      const parcelHalfX = (parcel.rect.maxX - parcel.rect.minX) / 2;
      const parcelHalfZ = (parcel.rect.maxZ - parcel.rect.minZ) / 2;
      if (
        Math.abs(cx - landmarkX) < landmark.extent[0] + parcelHalfX + 1.5 &&
        Math.abs(cz - landmarkZ) < landmark.extent[1] + parcelHalfZ + 1.5
      ) {
        continue;
      }
      const massing = fillerFor(district, parcel, index);
      buildings.push({
        id: `${district.id}-b${index}`,
        districtId: district.id,
        name: `${district.name} ${massing.name} ${index + 1}`,
        position: [cx, cz],
        rotationY: 0,
        parts: massing.parts,
        isLandmark: false,
        collisionHalfExtents: massing.extent,
        collisionHeight: massing.height,
      });
      index++;
    }
  }
  cachedBuildings = buildings;
  return buildings.map((b) => b);
}

/**
 * QPU pylon positions for a device topology, laid out inside the fenced
 * campus west of the quay so no pylon stands in a road corridor.
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
  // Campus interior: biased west of the district center (clear of the quay)
  // and south of the Cryostat Core landmark.
  const centerX = district.bounds.x - district.bounds.width * 0.08;
  const centerZ = district.bounds.z + district.bounds.depth * 0.175;
  const usableW = district.bounds.width * 0.52;
  const usableD = district.bounds.depth * 0.45;
  return devicePositions.map(([px, py]) => [
    centerX + ((px - minX) / spanX - 0.5) * usableW,
    centerZ + ((py - minY) / spanY - 0.5) * usableD,
  ]);
}
