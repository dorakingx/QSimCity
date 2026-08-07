import { DISTRICTS, type District, type DistrictId } from './districts.js';
import { ARTERIAL_SEGMENTS, corridorRect, type RoadRect, type RoadSegment } from './roads.js';
import { hash01, hashRange } from './util.js';
import { LANDMARK_SITES } from './landmarks.js';

/**
 * City blocks and parcels (spec §2.2). Each district's zone is cut by the
 * arterial corridors that cross it; oversized pieces are subdivided by local
 * streets; the resulting blocks are parceled into building lots, parks,
 * plazas, and work yards. Buildings are generated per parcel, which is what
 * guarantees they never stand in a road (acceptance W1.4, W1.6).
 */

export type ParcelUsage = 'building' | 'park' | 'plaza' | 'yard';

export interface Block {
  readonly id: string;
  readonly districtId: DistrictId;
  readonly rect: RoadRect;
}

export interface Parcel {
  readonly id: string;
  readonly districtId: DistrictId;
  readonly blockId: string;
  readonly rect: RoadRect;
  readonly usage: ParcelUsage;
}

export interface DistrictPlan {
  readonly districtId: DistrictId;
  readonly blocks: readonly Block[];
  readonly parcels: readonly Parcel[];
  readonly localStreets: readonly RoadSegment[];
}

const MIN_BLOCK = 12;
const MAX_BLOCK = 48;
const LOCAL_STREET_WIDTH = 6.5;
const LOCAL_SIDEWALK = 1.5;

function rectWidth(r: RoadRect): number {
  return r.maxX - r.minX;
}

function rectDepth(r: RoadRect): number {
  return r.maxZ - r.minZ;
}

function overlaps(a: RoadRect, b: RoadRect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Subtract a corridor from a rect, returning the remaining pieces. */
function subtract(rect: RoadRect, corridor: RoadRect): RoadRect[] {
  if (!overlaps(rect, corridor)) return [rect];
  const pieces: RoadRect[] = [];
  // West piece.
  if (corridor.minX > rect.minX) {
    pieces.push({ ...rect, maxX: Math.min(rect.maxX, corridor.minX) });
  }
  // East piece.
  if (corridor.maxX < rect.maxX) {
    pieces.push({ ...rect, minX: Math.max(rect.minX, corridor.maxX) });
  }
  // Middle strip north and south pieces.
  const midMinX = Math.max(rect.minX, corridor.minX);
  const midMaxX = Math.min(rect.maxX, corridor.maxX);
  if (midMaxX > midMinX) {
    if (corridor.minZ > rect.minZ) {
      pieces.push({ minX: midMinX, maxX: midMaxX, minZ: rect.minZ, maxZ: corridor.minZ });
    }
    if (corridor.maxZ < rect.maxZ) {
      pieces.push({ minX: midMinX, maxX: midMaxX, minZ: corridor.maxZ, maxZ: rect.maxZ });
    }
  }
  return pieces.filter((p) => rectWidth(p) >= MIN_BLOCK && rectDepth(p) >= MIN_BLOCK);
}

/** True when a proposed street corridor would cut through a landmark site. */
function cutsLandmark(districtId: DistrictId, corridor: RoadRect): boolean {
  const site = LANDMARK_SITES[districtId];
  const margin = 1;
  return (
    corridor.minX < site.anchor[0] + site.clearHalfW + margin &&
    corridor.maxX > site.anchor[0] - site.clearHalfW - margin &&
    corridor.minZ < site.anchor[1] + site.clearHalfD + margin &&
    corridor.maxZ > site.anchor[1] - site.clearHalfD - margin
  );
}

/**
 * Split oversized pieces with local streets. Streets are placed near the
 * middle with a deterministic jitter so the grid does not read as perfectly
 * mechanical, and never through a landmark site.
 */
function subdivide(
  rect: RoadRect,
  districtId: DistrictId,
  path: string,
  streets: RoadSegment[],
): RoadRect[] {
  const width = rectWidth(rect);
  const depth = rectDepth(rect);
  if (width <= MAX_BLOCK && depth <= MAX_BLOCK) return [rect];
  const corridorHalf = LOCAL_STREET_WIDTH / 2 + LOCAL_SIDEWALK;
  const vertical = width >= depth;
  const jitter = hashRange(`${districtId}:${path}:${vertical ? 'vx' : 'vz'}`, 0.42, 0.58);
  // Try the jittered middle first, then two fallbacks that may clear the
  // landmark site; give up (keep the piece whole) if all cuts collide.
  for (const fraction of [jitter, 0.3, 0.7, 0.22, 0.78]) {
    if (vertical) {
      const cut = rect.minX + width * fraction;
      const corridor: RoadRect = {
        minX: cut - corridorHalf,
        maxX: cut + corridorHalf,
        minZ: rect.minZ,
        maxZ: rect.maxZ,
      };
      if (cutsLandmark(districtId, corridor)) continue;
      streets.push({
        id: `local-${districtId}-${path}-v`,
        roadClass: 'local',
        a: { x: cut, z: rect.minZ - LOCAL_SIDEWALK },
        b: { x: cut, z: rect.maxZ + LOCAL_SIDEWALK },
        width: LOCAL_STREET_WIDTH,
        sidewalk: LOCAL_SIDEWALK,
        median: 0,
      });
      return [
        ...subdivide({ ...rect, maxX: cut - corridorHalf }, districtId, `${path}w`, streets),
        ...subdivide({ ...rect, minX: cut + corridorHalf }, districtId, `${path}e`, streets),
      ];
    }
    const cut = rect.minZ + depth * fraction;
    const corridor: RoadRect = {
      minX: rect.minX,
      maxX: rect.maxX,
      minZ: cut - corridorHalf,
      maxZ: cut + corridorHalf,
    };
    if (cutsLandmark(districtId, corridor)) continue;
    streets.push({
      id: `local-${districtId}-${path}-h`,
      roadClass: 'local',
      a: { x: rect.minX - LOCAL_SIDEWALK, z: cut },
      b: { x: rect.maxX + LOCAL_SIDEWALK, z: cut },
      width: LOCAL_STREET_WIDTH,
      sidewalk: LOCAL_SIDEWALK,
      median: 0,
    });
    return [
      ...subdivide({ ...rect, maxZ: cut - corridorHalf }, districtId, `${path}n`, streets),
      ...subdivide({ ...rect, minZ: cut + corridorHalf }, districtId, `${path}s`, streets),
    ];
  }
  return [rect];
}

/** Parcel grid inside a block, sized for the district's building style. */
function parcelize(block: Block, district: District): Parcel[] {
  const industrial =
    district.id === 'ir-foundry' ||
    district.id === 'optimization-works' ||
    district.id === 'translation-refinery';
  const portside = district.id === 'program-port' || district.id === 'measurement-harbor';
  const campus =
    district.id === 'qpu-grid' ||
    district.id === 'noise-atmosphere' ||
    district.id === 'observatory';
  // Target lot size: bigger lots for industry and yards, tighter urban lots.
  const target = industrial || portside ? 18 : campus ? 26 : 13;
  const width = rectWidth(block.rect);
  const depth = rectDepth(block.rect);
  const cols = Math.max(1, Math.round(width / target));
  const rows = Math.max(1, Math.round(depth / target));
  const parcels: Parcel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rect: RoadRect = {
        minX: block.rect.minX + (c / cols) * width,
        maxX: block.rect.minX + ((c + 1) / cols) * width,
        minZ: block.rect.minZ + (r / rows) * depth,
        maxZ: block.rect.minZ + ((r + 1) / rows) * depth,
      };
      const id = `${block.id}-p${r}x${c}`;
      const roll = hash01(`${id}:usage`);
      let usage: ParcelUsage;
      if (campus) {
        usage = roll < 0.42 ? 'park' : roll < 0.85 ? 'building' : 'plaza';
      } else if (portside) {
        usage = roll < 0.48 ? 'yard' : roll < 0.94 ? 'building' : 'plaza';
      } else if (industrial) {
        usage = roll < 0.72 ? 'building' : roll < 0.94 ? 'yard' : 'park';
      } else {
        usage = roll < 0.86 ? 'building' : roll < 0.94 ? 'park' : 'plaza';
      }
      parcels.push({ id, districtId: district.id, blockId: block.id, rect, usage });
    }
  }
  // Guarantee at least one building parcel per block so no block is empty.
  if (!parcels.some((p) => p.usage === 'building') && parcels.length > 0) {
    const first = parcels[0]!;
    parcels[0] = { ...first, usage: 'building' };
  }
  return parcels;
}

/** Compute the full plan for one district. */
export function planDistrict(district: District): DistrictPlan {
  const zone: RoadRect = {
    minX: district.bounds.x - district.bounds.width / 2,
    maxX: district.bounds.x + district.bounds.width / 2,
    minZ: district.bounds.z - district.bounds.depth / 2,
    maxZ: district.bounds.z + district.bounds.depth / 2,
  };
  let pieces: RoadRect[] = [zone];
  for (const segment of ARTERIAL_SEGMENTS) {
    const corridor = corridorRect(segment);
    pieces = pieces.flatMap((piece) => subtract(piece, corridor));
  }
  const localStreets: RoadSegment[] = [];
  const blockRects = pieces.flatMap((piece, i) =>
    subdivide(piece, district.id, `b${i}`, localStreets),
  );
  const blocks = blockRects.map((rect, i): Block => ({
    id: `${district.id}-block${i}`,
    districtId: district.id,
    rect,
  }));
  const parcels = blocks.flatMap((block) => parcelize(block, district));
  return { districtId: district.id, blocks, parcels, localStreets };
}

let cachedPlans: readonly DistrictPlan[] | null = null;

/** Plans for all twelve districts (memoized; the input is constant). */
export function districtPlans(): readonly DistrictPlan[] {
  cachedPlans ??= DISTRICTS.map(planDistrict);
  return cachedPlans;
}
