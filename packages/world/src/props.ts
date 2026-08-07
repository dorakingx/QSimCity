import { CITY_SCALE, type DistrictId } from './districts.js';
import type { Parcel } from './blocks.js';
import type { RoadRect, RoadSegment } from './roads.js';
import { lampPositions } from './roads.js';
import { EAST_COAST_X, WEST_COAST_X, eastCoastAt, westCoastAt } from './terrain.js';
import { hash01, type Vec2 } from './util.js';

/**
 * Street furniture and environment props (spec §2.2): lamps, trees, benches,
 * container stacks, parked cars, moored ships, piers, and the QPU campus
 * fence. Pure deterministic data; the visual engine instances the geometry.
 */

export type PropKind =
  'lamp' | 'tree' | 'bench' | 'container' | 'parked-car' | 'ship' | 'pier' | 'fence-post' | 'buoy';

export interface Prop {
  readonly kind: PropKind;
  readonly position: Vec2;
  readonly rotationY: number;
  /** Deterministic size/color variation in [0, 1). */
  readonly variant: number;
  readonly districtId?: DistrictId;
}

/** The fenced QPU campus rectangle (no public roads inside). */
export const QPU_CAMPUS: RoadRect = {
  minX: 158 * CITY_SCALE,
  maxX: 228 * CITY_SCALE,
  minZ: -18 * CITY_SCALE,
  maxZ: 58 * CITY_SCALE,
};

/** Gate gap on the campus's west fence, aligned with the boulevard axis. */
export const QPU_GATE = {
  x: 158 * CITY_SCALE,
  minZ: 20 * CITY_SCALE - 16,
  maxZ: 20 * CITY_SCALE + 16,
} as const;

/** Piers reaching into the water from both quays. */
export interface Pier {
  readonly id: string;
  readonly rect: RoadRect;
}

/** Pier lengths are true meters, anchored to the scaled coastlines. */
export const PIERS: readonly Pier[] = [
  {
    id: 'pier-port-north',
    rect: {
      minX: WEST_COAST_X - 38,
      maxX: WEST_COAST_X,
      minZ: 4 * CITY_SCALE,
      maxZ: 4 * CITY_SCALE + 8,
    },
  },
  {
    id: 'pier-port-south',
    rect: {
      minX: WEST_COAST_X - 32,
      maxX: WEST_COAST_X,
      minZ: 34 * CITY_SCALE,
      maxZ: 34 * CITY_SCALE + 8,
    },
  },
  {
    id: 'pier-harbor-north',
    rect: {
      minX: EAST_COAST_X,
      maxX: EAST_COAST_X + 38,
      minZ: 74 * CITY_SCALE,
      maxZ: 74 * CITY_SCALE + 8,
    },
  },
  {
    id: 'pier-harbor-south',
    rect: {
      minX: EAST_COAST_X,
      maxX: EAST_COAST_X + 32,
      minZ: 102 * CITY_SCALE,
      maxZ: 102 * CITY_SCALE + 8,
    },
  },
];

/**
 * Water props are placed relative to the shoreline at their own z, not to
 * a fixed x. The coast wanders (see terrain.ts), so a ship moored a fixed
 * distance west of WEST_COAST_X could end up beached on the land the
 * wander added — which is precisely what the W1.1 prop test caught.
 */
function westOfShore(z: number, distance: number): { x: number; z: number } {
  return { x: westCoastAt(z) - distance, z };
}

function eastOfShore(z: number, distance: number): { x: number; z: number } {
  return { x: eastCoastAt(z) + distance, z };
}

/** Moored ships alongside the piers (illustrative harbor life). */
const SHIPS: readonly Prop[] = [
  {
    kind: 'ship',
    position: westOfShore(4 * CITY_SCALE + 22, 20),
    rotationY: 0,
    variant: 0.2,
    districtId: 'program-port',
  },
  {
    kind: 'ship',
    position: westOfShore(34 * CITY_SCALE + 24, 16),
    rotationY: Math.PI,
    variant: 0.7,
    districtId: 'program-port',
  },
  {
    kind: 'ship',
    position: eastOfShore(74 * CITY_SCALE + 22, 18),
    rotationY: Math.PI,
    variant: 0.45,
    districtId: 'measurement-harbor',
  },
  {
    kind: 'ship',
    position: eastOfShore(102 * CITY_SCALE + 24, 14),
    rotationY: 0,
    variant: 0.9,
    districtId: 'measurement-harbor',
  },
];

const BUOYS: readonly Prop[] = [
  {
    kind: 'buoy',
    position: westOfShore(-8 * CITY_SCALE, 72),
    rotationY: 0,
    variant: 0.1,
  },
  {
    kind: 'buoy',
    position: westOfShore(64 * CITY_SCALE, 84),
    rotationY: 0,
    variant: 0.5,
  },
  {
    kind: 'buoy',
    position: eastOfShore(60 * CITY_SCALE, 74),
    rotationY: 0,
    variant: 0.3,
  },
  {
    kind: 'buoy',
    position: eastOfShore(128 * CITY_SCALE, 82),
    rotationY: 0,
    variant: 0.8,
  },
];

/** Deterministic scatter of points inside a rect with a margin. */
function scatterInRect(rect: RoadRect, count: number, seed: string, margin = 1.5): Vec2[] {
  const points: Vec2[] = [];
  const w = rect.maxX - rect.minX - margin * 2;
  const d = rect.maxZ - rect.minZ - margin * 2;
  if (w <= 0 || d <= 0) return points;
  for (let i = 0; i < count; i++) {
    points.push({
      x: rect.minX + margin + hash01(`${seed}:${i}:x`) * w,
      z: rect.minZ + margin + hash01(`${seed}:${i}:z`) * d,
    });
  }
  return points;
}

/** Trees, benches for park and plaza parcels. */
function parcelProps(parcel: Parcel): Prop[] {
  const props: Prop[] = [];
  const area = (parcel.rect.maxX - parcel.rect.minX) * (parcel.rect.maxZ - parcel.rect.minZ);
  if (parcel.usage === 'park') {
    const trees = Math.max(3, Math.round(area / 40));
    for (const [i, p] of scatterInRect(parcel.rect, trees, `${parcel.id}:tree`).entries()) {
      props.push({
        kind: 'tree',
        position: p,
        rotationY: hash01(`${parcel.id}:tr${i}`) * Math.PI * 2,
        variant: hash01(`${parcel.id}:tv${i}`),
        districtId: parcel.districtId,
      });
    }
  } else if (parcel.usage === 'plaza') {
    const benches = Math.max(1, Math.round(area / 160));
    for (const [i, p] of scatterInRect(parcel.rect, benches, `${parcel.id}:bench`, 2.5).entries()) {
      props.push({
        kind: 'bench',
        position: p,
        rotationY: Math.round(hash01(`${parcel.id}:br${i}`) * 4) * (Math.PI / 2),
        variant: hash01(`${parcel.id}:bv${i}`),
        districtId: parcel.districtId,
      });
    }
    // A few trees soften plaza corners.
    for (const [i, p] of scatterInRect(parcel.rect, 2, `${parcel.id}:ptree`, 2).entries()) {
      props.push({
        kind: 'tree',
        position: p,
        rotationY: 0,
        variant: hash01(`${parcel.id}:ptv${i}`),
        districtId: parcel.districtId,
      });
    }
  } else if (parcel.usage === 'yard') {
    const portside =
      parcel.districtId === 'program-port' || parcel.districtId === 'measurement-harbor';
    if (portside) {
      // Container rows fill harbor yards.
      const w = parcel.rect.maxX - parcel.rect.minX;
      const d = parcel.rect.maxZ - parcel.rect.minZ;
      const cols = Math.max(1, Math.floor(w / 8));
      const rows = Math.max(1, Math.floor(d / 5));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hash01(`${parcel.id}:c${r}x${c}`) > 0.62) continue;
          props.push({
            kind: 'container',
            position: {
              x: parcel.rect.minX + (c + 0.5) * (w / cols),
              z: parcel.rect.minZ + (r + 0.5) * (d / rows),
            },
            rotationY: 0,
            variant: hash01(`${parcel.id}:cv${r}x${c}`),
            districtId: parcel.districtId,
          });
        }
      }
    }
  }
  return props;
}

/** Street lamps for a set of segments. */
function lampProps(segments: readonly RoadSegment[]): Prop[] {
  const props: Prop[] = [];
  for (const segment of segments) {
    if (segment.roadClass === 'local') continue;
    for (const [i, p] of lampPositions(segment).entries()) {
      props.push({
        kind: 'lamp',
        position: p,
        rotationY: 0,
        variant: hash01(`${segment.id}:lamp${i}`),
      });
    }
  }
  return props;
}

/** Parked cars along local street curbs. */
function parkedCarProps(segments: readonly RoadSegment[]): Prop[] {
  const props: Prop[] = [];
  for (const segment of segments) {
    if (segment.roadClass !== 'local') continue;
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.z - segment.a.z;
    const length = Math.hypot(dx, dz);
    const slots = Math.floor(length / 7);
    if (slots < 2) continue;
    const ux = dx / length;
    const uz = dz / length;
    const offset = segment.width / 2 - 1.1;
    for (let i = 1; i < slots; i++) {
      if (hash01(`${segment.id}:park${i}`) > 0.45) continue;
      const t = i * 7;
      const side = hash01(`${segment.id}:side${i}`) > 0.5 ? 1 : -1;
      props.push({
        kind: 'parked-car',
        position: {
          x: segment.a.x + ux * t + uz * offset * side,
          z: segment.a.z + uz * t - ux * offset * side,
        },
        rotationY: Math.atan2(dx, dz) + (side > 0 ? 0 : Math.PI),
        variant: hash01(`${segment.id}:pv${i}`),
      });
    }
  }
  return props;
}

/** Boulevard median trees. */
function medianTreeProps(segments: readonly RoadSegment[]): Prop[] {
  const props: Prop[] = [];
  for (const segment of segments) {
    if (segment.roadClass !== 'boulevard') continue;
    const dx = segment.b.x - segment.a.x;
    const length = Math.hypot(dx, segment.b.z - segment.a.z);
    const count = Math.floor(length / 15);
    for (let i = 1; i < count; i++) {
      props.push({
        kind: 'tree',
        position: { x: segment.a.x + (dx / length) * i * 15, z: segment.a.z },
        rotationY: hash01(`${segment.id}:mt${i}`) * Math.PI,
        variant: 0.3 + 0.4 * hash01(`${segment.id}:mtv${i}`),
      });
    }
  }
  return props;
}

/** Sidewalk street trees along avenues and collectors. */
function sidewalkTreeProps(segments: readonly RoadSegment[]): Prop[] {
  const props: Prop[] = [];
  for (const segment of segments) {
    if (segment.roadClass !== 'avenue' && segment.roadClass !== 'collector') continue;
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.z - segment.a.z;
    const length = Math.hypot(dx, dz);
    const spacing = 20;
    const count = Math.floor(length / spacing);
    if (count < 2) continue;
    const ux = dx / length;
    const uz = dz / length;
    const offset = segment.width / 2 + segment.sidewalk + 1.0;
    for (let i = 1; i < count; i++) {
      const t = i * spacing;
      const px = segment.a.x + ux * t;
      const pz = segment.a.z + uz * t;
      const side = i % 2 === 0 ? 1 : -1;
      if (hash01(`${segment.id}:st${i}`) > 0.75) continue;
      props.push({
        kind: 'tree',
        position: { x: px + uz * offset * side, z: pz - ux * offset * side },
        rotationY: hash01(`${segment.id}:str${i}`) * Math.PI * 2,
        variant: hash01(`${segment.id}:stv${i}`),
      });
    }
  }
  return props;
}

/** Fence posts around the QPU campus, leaving the gate gap open. */
function fenceProps(): Prop[] {
  const props: Prop[] = [];
  const { minX, maxX, minZ, maxZ } = QPU_CAMPUS;
  const spacing = 4;
  const add = (x: number, z: number): void => {
    if (Math.abs(x - QPU_GATE.x) < 0.5 && z > QPU_GATE.minZ - 0.5 && z < QPU_GATE.maxZ + 0.5) {
      return;
    }
    props.push({
      kind: 'fence-post',
      position: { x, z },
      rotationY: 0,
      variant: 0,
      districtId: 'qpu-grid',
    });
  };
  for (let x = minX; x <= maxX; x += spacing) {
    add(x, minZ);
    add(x, maxZ);
  }
  for (let z = minZ + spacing; z < maxZ; z += spacing) {
    add(minX, z);
    add(maxX, z);
  }
  return props;
}

/**
 * All props for the given road segments and parcels. `excludeBoxes` (usually
 * landmark footprints) suppress ground props that would clip into geometry.
 */
export function generateProps(
  segments: readonly RoadSegment[],
  parcels: readonly Parcel[],
  excludeBoxes: readonly RoadRect[] = [],
): Prop[] {
  const props = [
    ...lampProps(segments),
    ...medianTreeProps(segments),
    ...sidewalkTreeProps(segments),
    ...parkedCarProps(segments),
    ...parcels.flatMap(parcelProps),
    ...fenceProps(),
    ...SHIPS,
    ...BUOYS,
  ];
  if (excludeBoxes.length === 0) return props;
  return props.filter((prop) => {
    if (prop.kind === 'ship' || prop.kind === 'buoy' || prop.kind === 'fence-post') return true;
    return !excludeBoxes.some(
      (box) =>
        prop.position.x > box.minX &&
        prop.position.x < box.maxX &&
        prop.position.z > box.minZ &&
        prop.position.z < box.maxZ,
    );
  });
}
