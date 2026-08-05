import { CITY_BOUNDS, DISTRICTS, type DistrictId } from './districts.js';
import { ARTERIAL_SEGMENTS, corridorRect, type RoadRect } from './roads.js';
import { EAST_COAST_X, WEST_COAST_X } from './terrain.js';
import { QPU_CAMPUS } from './props.js';
import { hash01, hashRange } from './util.js';
import type { Building, BuildingPart } from './buildings.js';

/**
 * Outskirt fabric (spec §2.4): the land between district zones is not empty
 * void but low-density city — housing clusters, fields, and tree groves —
 * so the twelve districts sit inside one continuous urban area. Outskirt
 * buildings are scenery: generated like district buildings, attributed to
 * the nearest district for picking, never landmarks.
 */

export type OutskirtUsage = 'housing' | 'field' | 'grove' | 'open';

export interface OutskirtParcel {
  readonly id: string;
  readonly rect: RoadRect;
  readonly usage: OutskirtUsage;
}

const MIN_PIECE = 24;
const TARGET = 30;

function overlaps(a: RoadRect, b: RoadRect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function subtract(rect: RoadRect, hole: RoadRect): RoadRect[] {
  if (!overlaps(rect, hole)) return [rect];
  const pieces: RoadRect[] = [];
  if (hole.minX > rect.minX) pieces.push({ ...rect, maxX: Math.min(rect.maxX, hole.minX) });
  if (hole.maxX < rect.maxX) pieces.push({ ...rect, minX: Math.max(rect.minX, hole.maxX) });
  const midMinX = Math.max(rect.minX, hole.minX);
  const midMaxX = Math.min(rect.maxX, hole.maxX);
  if (midMaxX > midMinX) {
    if (hole.minZ > rect.minZ) {
      pieces.push({ minX: midMinX, maxX: midMaxX, minZ: rect.minZ, maxZ: hole.minZ });
    }
    if (hole.maxZ < rect.maxZ) {
      pieces.push({ minX: midMinX, maxX: midMaxX, minZ: hole.maxZ, maxZ: rect.maxZ });
    }
  }
  return pieces.filter((p) => p.maxX - p.minX >= MIN_PIECE && p.maxZ - p.minZ >= MIN_PIECE);
}

let cachedParcels: readonly OutskirtParcel[] | null = null;

/** Parcels of every gap between district zones, corridors, and coasts. */
export function outskirtParcels(): readonly OutskirtParcel[] {
  if (cachedParcels) return cachedParcels;
  let pieces: RoadRect[] = [
    {
      minX: Math.max(CITY_BOUNDS.minX, WEST_COAST_X + 8),
      maxX: Math.min(CITY_BOUNDS.maxX, EAST_COAST_X - 8),
      minZ: CITY_BOUNDS.minZ + 6,
      maxZ: CITY_BOUNDS.maxZ - 6,
    },
  ];
  const holes: RoadRect[] = [
    ...DISTRICTS.map((d) => ({
      minX: d.bounds.x - d.bounds.width / 2 - 6,
      maxX: d.bounds.x + d.bounds.width / 2 + 6,
      minZ: d.bounds.z - d.bounds.depth / 2 - 6,
      maxZ: d.bounds.z + d.bounds.depth / 2 + 6,
    })),
    QPU_CAMPUS,
    ...ARTERIAL_SEGMENTS.map(corridorRect),
  ];
  for (const hole of holes) {
    pieces = pieces.flatMap((piece) => subtract(piece, hole));
  }
  // Split oversized pieces on a coarse grid.
  const parcels: OutskirtParcel[] = [];
  let index = 0;
  for (const piece of pieces) {
    const w = piece.maxX - piece.minX;
    const d = piece.maxZ - piece.minZ;
    const cols = Math.max(1, Math.round(w / TARGET));
    const rows = Math.max(1, Math.round(d / TARGET));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `outskirt-p${index++}`;
        const rect = {
          minX: piece.minX + (c / cols) * w,
          maxX: piece.minX + ((c + 1) / cols) * w,
          minZ: piece.minZ + (r / rows) * d,
          maxZ: piece.minZ + ((r + 1) / rows) * d,
        };
        // Fields belong at the urban fringe: near the districts the gaps
        // fill with housing and greens, farmland appears with distance.
        const cx = (rect.minX + rect.maxX) / 2;
        const cz = (rect.minZ + rect.maxZ) / 2;
        let nearest = Infinity;
        for (const d2 of DISTRICTS) {
          const dx = Math.max(
            d2.bounds.x - d2.bounds.width / 2 - cx,
            0,
            cx - d2.bounds.x - d2.bounds.width / 2,
          );
          const dz = Math.max(
            d2.bounds.z - d2.bounds.depth / 2 - cz,
            0,
            cz - d2.bounds.z - d2.bounds.depth / 2,
          );
          nearest = Math.min(nearest, Math.hypot(dx, dz));
        }
        const fringe = Math.min(1, nearest / 90);
        const roll = hash01(`${id}:usage`);
        const usage: OutskirtUsage =
          roll < 0.6 - fringe * 0.3
            ? 'housing'
            : roll < 0.72 - fringe * 0.12
              ? 'grove'
              : roll < 0.68 + fringe * 0.28
                ? 'field'
                : 'open';
        parcels.push({ id, rect, usage });
      }
    }
  }
  cachedParcels = parcels;
  return parcels;
}

function nearestDistrictId(x: number, z: number): DistrictId {
  let best: DistrictId = DISTRICTS[0]!.id;
  let bestDistance = Infinity;
  for (const d of DISTRICTS) {
    const distance = Math.hypot(d.bounds.x - x, d.bounds.z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = d.id;
    }
  }
  return best;
}

function housePart(
  kind: BuildingPart['kind'],
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  facade?: BuildingPart['facade'],
): BuildingPart {
  return facade !== undefined
    ? { kind, offset, size, rotationY: 0, tone: 0, facade }
    : { kind, offset, size, rotationY: 0, tone: 0 };
}

let cachedBuildings: readonly Building[] | null = null;

/** Small houses filling the housing parcels. */
export function outskirtBuildings(): readonly Building[] {
  if (cachedBuildings) return cachedBuildings;
  const buildings: Building[] = [];
  for (const parcel of outskirtParcels()) {
    if (parcel.usage !== 'housing') continue;
    const w = parcel.rect.maxX - parcel.rect.minX;
    const d = parcel.rect.maxZ - parcel.rect.minZ;
    const cx = (parcel.rect.minX + parcel.rect.maxX) / 2;
    const cz = (parcel.rect.minZ + parcel.rect.maxZ) / 2;
    // A small cluster of two to four houses per parcel.
    const count = 2 + Math.round(hash01(`${parcel.id}:n`) * 2);
    for (let i = 0; i < count; i++) {
      const hx = cx + (hash01(`${parcel.id}:${i}:x`) - 0.5) * (w - 14);
      const hz = cz + (hash01(`${parcel.id}:${i}:z`) - 0.5) * (d - 14);
      const hw = hashRange(`${parcel.id}:${i}:w`, 6, 10);
      const hd = hashRange(`${parcel.id}:${i}:d`, 6, 9);
      const hh = hashRange(`${parcel.id}:${i}:h`, 3.4, 6.4);
      const facade = hash01(`${parcel.id}:${i}:f`) < 0.5 ? 'brick' : 'concrete';
      const parts: BuildingPart[] = [
        housePart('block', [0, 0, 0], [hw, hh, hd], facade),
        housePart('wedge', [0, hh, 0], [hw, 1.8, hd]),
      ];
      buildings.push({
        id: `outskirt-${parcel.id}-h${i}`,
        districtId: nearestDistrictId(hx, hz),
        name: 'Outskirt housing',
        position: [hx, hz],
        rotationY: hash01(`${parcel.id}:${i}:r`) < 0.5 ? 0 : Math.PI / 2,
        parts,
        isLandmark: false,
        collisionHalfExtents: [hw / 2 + 0.5, hd / 2 + 0.5],
        collisionHeight: hh + 1.8,
      });
    }
  }
  // Drop houses that landed on top of each other across parcel seams.
  const kept: Building[] = [];
  for (const b of buildings) {
    const collides = kept.some(
      (k) =>
        Math.abs(k.position[0] - b.position[0]) <
          k.collisionHalfExtents[0] + b.collisionHalfExtents[0] + 1 &&
        Math.abs(k.position[1] - b.position[1]) <
          k.collisionHalfExtents[1] + b.collisionHalfExtents[1] + 1,
    );
    if (!collides) kept.push(b);
  }
  cachedBuildings = kept;
  return kept;
}
