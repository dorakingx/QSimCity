import { STAGES, type Trace } from 'qsimcity-trace';
import { CITY_SCALE, DISTRICTS, districtForStage, type DistrictId } from './districts.js';
import { LANDMARK_SITES } from './landmarks.js';
import { eventsAt, maxTickOf } from './playback.js';
import { QPU_GATE } from './props.js';
import { ARTERIAL_SEGMENTS, lanePath, type RoadSegment } from './roads.js';
import { distance2, hash01, lerp, type Vec2 } from './util.js';

/**
 * Moving agents (spec §4, acceptance W3.1-W3.3): the semantic job convoy and
 * classical couriers, plus illustrative ambient cars and pedestrians. Per the
 * semantic rule, vehicles and people represent instructions, jobs, or
 * classical messages — never amplitudes or quantum states. Everything is a
 * pure function of its inputs; no module state advances on its own.
 */

export interface VehicleState {
  readonly kind: 'job-convoy' | 'courier' | 'ambient-car';
  readonly id: string;
  readonly position: Vec2;
  /** Rotation around Y for a vehicle model whose nose points +z when heading = 0 (i.e. heading = Math.atan2(dx, dz) of the travel direction). */
  readonly heading: number;
  /** For couriers: the measured classical bit they carry, e.g. "c0 = 1". */
  readonly label?: string;
}

export interface PedestrianState {
  readonly id: string;
  readonly position: Vec2;
  readonly heading: number;
}

function segment(id: string): RoadSegment {
  const found = ARTERIAL_SEGMENTS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown arterial segment: ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// The job convoy (SEMANTIC, COMPUTED): the compiled program on the boulevard.
// ---------------------------------------------------------------------------

const EXECUTION_STAGE_INDEX = STAGES.indexOf('execution');

/** The Processing Boulevard's eastbound (a-to-b) driving lane. */
const BOULEVARD_LANE = (() => {
  const points = lanePath(segment('blvd'), true);
  const start = points[0]!;
  const end = points[points.length - 1]!;
  return { start, end, minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x) };
})();

/**
 * Boulevard x coordinate where the convoy stands for a stage: the stage
 * district's landmark anchor clamped to the boulevard's extent. Execution and
 * every later stage stop at the QPU campus gate — the fenced campus has no
 * public through-road, so the convoy waits at the gate while the QPU runs.
 */
function stageGateX(stageIndex: number): number {
  const gateX =
    stageIndex >= EXECUTION_STAGE_INDEX
      ? QPU_GATE.x
      : LANDMARK_SITES[districtForStage(STAGES[stageIndex]!).id].anchor[0];
  return Math.max(BOULEVARD_LANE.minX, Math.min(BOULEVARD_LANE.maxX, gateX));
}

/**
 * The job convoy: the compiled program traveling the Processing Boulevard.
 * Pure function of (trace, tick): at tick T it sits at the boulevard point
 * for the most advanced stage reached by tick T (before the QPU gate for
 * execution and later stages). Returns null with no trace.
 */
export function convoyAt(trace: Trace | null, tick: number): VehicleState | null {
  if (!trace) return null;
  let mostAdvanced = -1;
  for (const event of trace.events) {
    if (event.logicalTick > tick) continue;
    const index = STAGES.indexOf(event.stage);
    if (index > mostAdvanced) mostAdvanced = index;
  }
  const x = mostAdvanced < 0 ? BOULEVARD_LANE.start.x : stageGateX(mostAdvanced);
  return {
    kind: 'job-convoy',
    id: 'job-convoy',
    position: { x, z: BOULEVARD_LANE.start.z },
    heading: Math.atan2(
      BOULEVARD_LANE.end.x - BOULEVARD_LANE.start.x,
      BOULEVARD_LANE.end.z - BOULEVARD_LANE.start.z,
    ),
  };
}

// ---------------------------------------------------------------------------
// Classical couriers (SEMANTIC, SAMPLED cargo): measured bits going to
// the Classical Control Center along the south collector road.
// ---------------------------------------------------------------------------

/** Journey length of a courier in playback ticks. */
export const COURIER_JOURNEY_TICKS = 3;

/** The south collector's westbound (b-to-a) driving lane, harbor to center. */
const COURIER_ROUTE = (() => {
  const lane = lanePath(segment('col-south'), false);
  return {
    z: lane[0]!.z,
    startX: LANDMARK_SITES['measurement-harbor'].anchor[0],
    endX: LANDMARK_SITES['classical-control'].anchor[0],
  };
})();

/**
 * Classical couriers: measurement results traveling from the Measurement
 * Harbor to the Classical Control Center. A courier exists for each
 * measurement.sampled event whose journey (a fixed number of ticks) is in
 * progress at the tick; feed-forward evaluation completes journeys. Pure
 * function of (trace, tick); interpolate along the south collector road.
 */
export function couriersAt(trace: Trace | null, tick: number): VehicleState[] {
  if (!trace) return [];
  const classicalTicks = trace.events
    .filter((event) => event.eventType === 'classical.condition_evaluated')
    .map((event) => event.logicalTick);
  const couriers: VehicleState[] = [];
  for (const event of trace.events) {
    if (event.eventType !== 'measurement.sampled') continue;
    const spawn = event.logicalTick;
    if (tick < spawn) continue;
    // Feed-forward evaluation completes the journey: the courier arrives by
    // the earliest classical.condition_evaluated tick after its departure.
    let arrival = spawn + COURIER_JOURNEY_TICKS;
    for (const classicalTick of classicalTicks) {
      if (classicalTick > spawn && classicalTick < arrival) arrival = classicalTick;
    }
    if (tick >= arrival) continue;
    const progress = (tick - spawn) / (arrival - spawn);
    const clbit = event.payload['clbit'];
    const outcome = event.payload['outcome'];
    const label =
      typeof clbit === 'number' && (outcome === 0 || outcome === 1)
        ? `c${clbit} = ${outcome}`
        : undefined;
    couriers.push({
      kind: 'courier',
      id: `courier-${event.eventId}`,
      position: { x: lerp(COURIER_ROUTE.startX, COURIER_ROUTE.endX, progress), z: COURIER_ROUTE.z },
      heading: Math.atan2(COURIER_ROUTE.endX - COURIER_ROUTE.startX, 0),
      ...(label !== undefined ? { label } : {}),
    });
  }
  return couriers;
}

// ---------------------------------------------------------------------------
// Ambient traffic (ILLUSTRATIVE): deterministic cars on fixed arterial loops.
// ---------------------------------------------------------------------------

interface AmbientLoop {
  readonly id: string;
  readonly points: readonly Vec2[];
  readonly total: number;
  readonly carCount: number;
}

interface LoopLeg {
  readonly segmentId: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

/**
 * Three fixed rectangular loops assembled from arterial segments (endpoints
 * on the compact authoring grid, scaled to city scale):
 *
 * - west:   col-north / ave-foundry / col-south / ave-port
 * - center: col-north / ave-works / col-south / ave-transit
 * - harbor: col-north / quay-east / col-south / ave-tower
 *
 * Each leg samples the right-hand driving lane via `lanePath`, so cars stay
 * on lane polylines and never cut across blocks.
 */
const LOOP_SPECS: readonly { id: string; carCount: number; legs: readonly LoopLeg[] }[] = [
  {
    id: 'west',
    carCount: 7,
    legs: [
      { segmentId: 'col-north', from: [-132, -26], to: [-69, -26] },
      { segmentId: 'ave-foundry', from: [-69, -26], to: [-69, 95] },
      { segmentId: 'col-south', from: [-69, 95], to: [-132, 95] },
      { segmentId: 'ave-port', from: [-132, 95], to: [-132, -26] },
    ],
  },
  {
    id: 'center',
    carCount: 7,
    legs: [
      { segmentId: 'col-north', from: [44, -26], to: [97, -26] },
      { segmentId: 'ave-works', from: [97, -26], to: [97, 95] },
      { segmentId: 'col-south', from: [97, 95], to: [44, 95] },
      { segmentId: 'ave-transit', from: [44, 95], to: [44, -26] },
    ],
  },
  {
    id: 'harbor',
    carCount: 6,
    legs: [
      { segmentId: 'col-north', from: [150, -26], to: [232, -26] },
      { segmentId: 'quay-east', from: [232, -26], to: [232, 95] },
      { segmentId: 'col-south', from: [232, 95], to: [150, 95] },
      { segmentId: 'ave-tower', from: [150, 95], to: [150, -26] },
    ],
  },
];

function buildLoop(spec: (typeof LOOP_SPECS)[number]): AmbientLoop {
  const points: Vec2[] = [];
  spec.legs.forEach((leg, index) => {
    const base = segment(leg.segmentId);
    // A leg is a clipped copy of its arterial parent: same carriageway
    // shape, endpoints at the loop corners. lanePath then yields the
    // right-hand lane for the direction of travel.
    const clipped: RoadSegment = {
      ...base,
      id: `${base.id}:${spec.id}-leg${index}`,
      a: { x: leg.from[0] * CITY_SCALE, z: leg.from[1] * CITY_SCALE },
      b: { x: leg.to[0] * CITY_SCALE, z: leg.to[1] * CITY_SCALE },
    };
    for (const point of lanePath(clipped, true)) {
      const previous = points[points.length - 1];
      if (previous && distance2(previous, point) < 1e-6) continue;
      points.push(point);
    }
  });
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    total += distance2(points[i]!, points[(i + 1) % points.length]!);
  }
  return { id: spec.id, points, total, carCount: spec.carCount };
}

const AMBIENT_LOOPS: readonly AmbientLoop[] = LOOP_SPECS.map(buildLoop);

/** Position and heading at arc length s along the closed loop polyline. */
function sampleLoop(loop: AmbientLoop, s: number): { position: Vec2; heading: number } {
  let remaining = ((s % loop.total) + loop.total) % loop.total;
  for (let i = 0; i < loop.points.length; i++) {
    const a = loop.points[i]!;
    const b = loop.points[(i + 1) % loop.points.length]!;
    const length = distance2(a, b);
    if (remaining <= length || i === loop.points.length - 1) {
      const t = length < 1e-9 ? 0 : Math.min(1, remaining / length);
      return {
        position: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
        heading: Math.atan2(b.x - a.x, b.z - a.z),
      };
    }
    remaining -= length;
  }
  return { position: loop.points[0]!, heading: 0 };
}

/**
 * Deterministic ambient traffic on fixed arterial loops. Positions depend
 * only on animTimeSeconds and per-car seeds (ILLUSTRATIVE city life).
 * Returns an empty array when reducedMotion is true.
 */
// Per-car constants precomputed once: hashing template strings for every
// car on every animation frame was measurable churn (performance review).
const AMBIENT_CAR_PARAMS = AMBIENT_LOOPS.map((loop) =>
  Array.from({ length: loop.carCount }, (_, i) => {
    const seed = `ambient:${loop.id}:${i}`;
    return {
      id: seed,
      // Speed varies per car in roughly 9..13 m/s.
      speed: 9 + 4 * hash01(`${seed}:speed`),
      offset: hash01(`${seed}:phase`) * loop.total,
    };
  }),
);

export function ambientVehiclesAt(animTimeSeconds: number, reducedMotion: boolean): VehicleState[] {
  if (reducedMotion) return [];
  const cars: VehicleState[] = [];
  AMBIENT_LOOPS.forEach((loop, loopIndex) => {
    for (const car of AMBIENT_CAR_PARAMS[loopIndex]!) {
      const { position, heading } = sampleLoop(loop, car.offset + car.speed * animTimeSeconds);
      cars.push({ kind: 'ambient-car', id: car.id, position, heading });
    }
  });
  return cars;
}

// ---------------------------------------------------------------------------
// District activity and pedestrians (COMPUTED trigger, ILLUSTRATIVE paths).
// ---------------------------------------------------------------------------

/** Activity level per district at the tick in [0,1] (for pedestrian density and tests). */
// districtActivityAt is called every animation frame (pedestrian density),
// but its inputs only change when the playback tick does. A single-entry
// memo turns the per-frame O(trace.events) scan into a map lookup; purity
// is preserved because the result is derived only from (trace, tick).
let activityMemoTrace: Trace | null = null;
let activityMemoTick = -1;
let activityMemo: ReadonlyMap<DistrictId, number> | null = null;

export function districtActivityAt(
  trace: Trace | null,
  tick: number,
): ReadonlyMap<DistrictId, number> {
  if (activityMemo && activityMemoTrace === trace && activityMemoTick === tick) {
    return activityMemo;
  }
  const result = computeDistrictActivity(trace, tick);
  activityMemoTrace = trace;
  activityMemoTick = tick;
  activityMemo = result;
  return result;
}

function computeDistrictActivity(
  trace: Trace | null,
  tick: number,
): ReadonlyMap<DistrictId, number> {
  const activity = new Map<DistrictId, number>();
  for (const district of DISTRICTS) activity.set(district.id, 0);
  if (!trace) return activity;
  const clamped = Math.max(0, Math.min(tick, maxTickOf(trace)));
  for (const event of eventsAt(trace, clamped)) {
    const district = districtForStage(event.stage);
    activity.set(district.id, (activity.get(district.id) ?? 0) + 1);
  }
  for (const [id, count] of activity) {
    activity.set(id, count === 0 ? 0 : Math.min(1, count / 4));
  }
  return activity;
}

const MAX_PEDESTRIANS_PER_DISTRICT = 6;

/** Point and heading at arc length s around a clockwise rectangle walk. */
function rectangleWalk(
  anchor: readonly [number, number],
  halfW: number,
  halfD: number,
  s: number,
): { position: Vec2; heading: number } {
  const perimeter = 4 * (halfW + halfD);
  let remaining = ((s % perimeter) + perimeter) % perimeter;
  const minX = anchor[0] - halfW;
  const maxX = anchor[0] + halfW;
  const minZ = anchor[1] - halfD;
  const maxZ = anchor[1] + halfD;
  // North side, walking east.
  if (remaining <= 2 * halfW) {
    return { position: { x: minX + remaining, z: minZ }, heading: Math.atan2(1, 0) };
  }
  remaining -= 2 * halfW;
  // East side, walking south.
  if (remaining <= 2 * halfD) {
    return { position: { x: maxX, z: minZ + remaining }, heading: 0 };
  }
  remaining -= 2 * halfD;
  // South side, walking west.
  if (remaining <= 2 * halfW) {
    return { position: { x: maxX - remaining, z: maxZ }, heading: Math.atan2(-1, 0) };
  }
  remaining -= 2 * halfW;
  // West side, walking north.
  return { position: { x: minX, z: maxZ - remaining }, heading: Math.atan2(0, -1) };
}

/**
 * Walking figures near district sidewalks. Density scales with the
 * district's activity at the tick (COMPUTED trigger, ILLUSTRATIVE paths).
 * Deterministic in (trace, tick, animTimeSeconds). Empty when reducedMotion.
 */
export function pedestriansAt(
  trace: Trace | null,
  tick: number,
  animTimeSeconds: number,
  reducedMotion: boolean,
): PedestrianState[] {
  if (reducedMotion || !trace) return [];
  const activity = districtActivityAt(trace, tick);
  const pedestrians: PedestrianState[] = [];
  for (const district of DISTRICTS) {
    const level = activity.get(district.id) ?? 0;
    const base = level > 0 ? 2 : 1;
    const count = Math.min(
      MAX_PEDESTRIANS_PER_DISTRICT,
      Math.max(base, Math.ceil(level * MAX_PEDESTRIANS_PER_DISTRICT)),
    );
    const site = LANDMARK_SITES[district.id];
    // The walk loop rings the landmark's kept-clear ground like a sidewalk.
    const halfW = site.clearHalfW + 3;
    const halfD = site.clearHalfD + 3;
    const perimeter = 4 * (halfW + halfD);
    for (let i = 0; i < count; i++) {
      const params = pedestrianParams(district.id, i);
      const s = params.phase * perimeter + params.speed * animTimeSeconds;
      const { position, heading } = rectangleWalk(site.anchor, halfW, halfD, s);
      pedestrians.push({ id: params.id, position, heading });
    }
  }
  return pedestrians;
}

// Per-walker constants, hashed once instead of on every animation frame.
const pedestrianParamCache = new Map<string, { id: string; speed: number; phase: number }>();

function pedestrianParams(
  districtId: DistrictId,
  index: number,
): { id: string; speed: number; phase: number } {
  const seed = `ped:${districtId}:${index}`;
  let params = pedestrianParamCache.get(seed);
  if (!params) {
    params = {
      id: seed,
      speed: 1.1 + 0.5 * hash01(`${seed}:speed`),
      phase: hash01(`${seed}:phase`),
    };
    pedestrianParamCache.set(seed, params);
  }
  return params;
}
