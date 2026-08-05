import { districtPlans, type Block, type Parcel } from './blocks.js';
import {
  ARTERIAL_SEGMENTS,
  buildRoadGraph,
  computeJunctions,
  type Junction,
  type RoadGraph,
  type RoadSegment,
} from './roads.js';
import { generateProps, PIERS, type Pier, type Prop } from './props.js';
import { generateBuildings, type Building } from './buildings.js';
import { outskirtBuildings, outskirtParcels, type OutskirtParcel } from './outskirts.js';
import { hash01 } from './util.js';

/**
 * The composed city plan (spec §2): one memoized object holding every road
 * segment (arterial plus generated local streets), junctions, the routing
 * graph, blocks, parcels, piers, and props. All render surfaces and tests
 * consume this single plan so geometry decisions live in exactly one place.
 */

export interface Crosswalk {
  readonly position: { readonly x: number; readonly z: number };
  /** True when the stripes run north-south (crossing a horizontal road). */
  readonly acrossHorizontal: boolean;
  readonly width: number;
}

export interface CityPlan {
  readonly segments: readonly RoadSegment[];
  readonly junctions: readonly Junction[];
  readonly graph: RoadGraph;
  readonly blocks: readonly Block[];
  readonly parcels: readonly Parcel[];
  readonly outskirts: readonly OutskirtParcel[];
  /** District buildings plus outskirt housing: the full building stock. */
  readonly buildings: readonly Building[];
  readonly piers: readonly Pier[];
  readonly props: readonly Prop[];
  readonly crosswalks: readonly Crosswalk[];
}

function computeCrosswalks(junctions: readonly Junction[]): Crosswalk[] {
  const crosswalks: Crosswalk[] = [];
  for (const junction of junctions) {
    // Mark crossings on the boulevard and collectors only — one crosswalk
    // per junction keeps the read clean at street level.
    const major = junction.segmentIds.some((id) => id === 'blvd' || id.startsWith('col-'));
    if (!major) continue;
    crosswalks.push({
      position: junction.position,
      acrossHorizontal: true,
      width: 4,
    });
  }
  return crosswalks;
}

/** Grove trees on outskirt parcels, avoiding building footprints. */
function outskirtProps(
  exclusions: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[],
): Prop[] {
  const props: Prop[] = [];
  for (const parcel of outskirtParcels()) {
    if (parcel.usage === 'field') {
      const along = hash01(`${parcel.id}:hedge`) < 0.5;
      const count = Math.max(
        2,
        Math.round(
          ((along ? parcel.rect.maxX - parcel.rect.minX : parcel.rect.maxZ - parcel.rect.minZ) -
            4) /
            9,
        ),
      );
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const x = along
          ? parcel.rect.minX + 2 + t * (parcel.rect.maxX - parcel.rect.minX - 4)
          : parcel.rect.minX + 1.5;
        const z = along
          ? parcel.rect.minZ + 1.5
          : parcel.rect.minZ + 2 + t * (parcel.rect.maxZ - parcel.rect.minZ - 4);
        if (exclusions.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) continue;
        props.push({
          kind: 'tree',
          position: { x, z },
          rotationY: hash01(`${parcel.id}:h${i}:r`) * Math.PI * 2,
          variant: 0.05 + 0.2 * hash01(`${parcel.id}:h${i}:v`),
        });
      }
      continue;
    }
    if (parcel.usage !== 'grove' && parcel.usage !== 'housing') continue;
    const area = (parcel.rect.maxX - parcel.rect.minX) * (parcel.rect.maxZ - parcel.rect.minZ);
    const count =
      parcel.usage === 'grove'
        ? Math.max(3, Math.round(area / 90))
        : Math.max(1, Math.round(area / 320));
    for (let i = 0; i < count; i++) {
      const x =
        parcel.rect.minX +
        2 +
        hash01(`${parcel.id}:t${i}:x`) * (parcel.rect.maxX - parcel.rect.minX - 4);
      const z =
        parcel.rect.minZ +
        2 +
        hash01(`${parcel.id}:t${i}:z`) * (parcel.rect.maxZ - parcel.rect.minZ - 4);
      if (exclusions.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) continue;
      props.push({
        kind: 'tree',
        position: { x, z },
        rotationY: hash01(`${parcel.id}:t${i}:r`) * Math.PI * 2,
        variant: hash01(`${parcel.id}:t${i}:v`),
      });
    }
  }
  return props;
}

let cached: CityPlan | null = null;

/** Build (or return the memoized) full city plan. */
export function cityPlan(): CityPlan {
  if (cached) return cached;
  const plans = districtPlans();
  const localStreets = plans.flatMap((p) => p.localStreets);
  const segments = [...ARTERIAL_SEGMENTS, ...localStreets];
  const junctions = computeJunctions(segments);
  const graph = buildRoadGraph(ARTERIAL_SEGMENTS);
  const blocks = plans.flatMap((p) => p.blocks);
  const parcels = plans.flatMap((p) => p.parcels);
  const outskirts = outskirtParcels();
  const buildings = [...generateBuildings(), ...outskirtBuildings()];
  // Building footprints suppress ground props that would clip into walls.
  const exclusions = buildings.map((b) => ({
    minX: b.position[0] - b.collisionHalfExtents[0],
    maxX: b.position[0] + b.collisionHalfExtents[0],
    minZ: b.position[1] - b.collisionHalfExtents[1],
    maxZ: b.position[1] + b.collisionHalfExtents[1],
  }));
  const props = [...generateProps(segments, parcels, exclusions), ...outskirtProps(exclusions)];
  cached = {
    segments,
    junctions,
    graph,
    blocks,
    parcels,
    outskirts,
    buildings,
    piers: PIERS,
    props,
    crosswalks: computeCrosswalks(junctions),
  };
  return cached;
}
