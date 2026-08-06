import { describe, expect, it } from 'vitest';
import { TraceBuilder, deriveTraceId, type Trace } from 'qsimcity-trace';
import {
  ambientVehiclesAt,
  convoyAt,
  couriersAt,
  districtActivityAt,
  pedestriansAt,
  strollersAt,
  COURIER_JOURNEY_TICKS,
} from '../src/agents.js';
import { LANDMARK_SITES } from '../src/landmarks.js';
import { maxTickOf } from '../src/playback.js';
import { QPU_GATE } from '../src/props.js';
import { ARTERIAL_SEGMENTS, corridorHalfWidth, lanePath, type RoadSegment } from '../src/roads.js';
import type { Vec2 } from '../src/util.js';
import { compiledPipelineTrace } from './fixtures.js';

function fixtureBuilder(seed: string): TraceBuilder {
  return new TraceBuilder({
    traceId: deriveTraceId(seed, 'fixture'),
    seed,
    generator: 'test',
    generatorVersion: '1.0.0',
    packageVersions: {},
    programSource: 'fixture',
    deviceId: 'linear-5',
    shots: 4,
    noise: null,
  });
}

function buildFixture(builder: TraceBuilder): Trace {
  return builder.build({
    inputCircuit: { name: 'fixture', numQubits: 2, numClbits: 2, cregs: [], instructions: [] },
  });
}

/** Distance from a point to an axis-aligned segment's centerline. */
function distanceToSegment(point: Vec2, segment: RoadSegment): number {
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const cx = clamp(point.x, Math.min(segment.a.x, segment.b.x), Math.max(segment.a.x, segment.b.x));
  const cz = clamp(point.z, Math.min(segment.a.z, segment.b.z), Math.max(segment.a.z, segment.b.z));
  return Math.hypot(point.x - cx, point.z - cz);
}

function withinSomeCorridor(point: Vec2): boolean {
  return ARTERIAL_SEGMENTS.some(
    (segment) => distanceToSegment(point, segment) <= corridorHalfWidth(segment) + 0.5,
  );
}

describe('the job convoy (W3.1)', () => {
  it('returns null without a trace', () => {
    expect(convoyAt(null, 0)).toBeNull();
  });

  it('moves east monotonically and is a pure function of (trace, tick)', async () => {
    const { trace } = await compiledPipelineTrace({
      sampleId: 'swap-storm',
      layoutMethod: 'trivial',
    });
    let previousX = -Infinity;
    for (let tick = 0; tick <= maxTickOf(trace); tick++) {
      const convoy = convoyAt(trace, tick)!;
      expect(convoy.kind).toBe('job-convoy');
      expect(convoy.position.x).toBeGreaterThanOrEqual(previousX);
      previousX = convoy.position.x;
      expect(convoyAt(trace, tick)).toEqual(convoy);
    }
  });

  it('stays on the boulevard eastbound lane, heading east', async () => {
    const { trace } = await compiledPipelineTrace({ sampleId: 'bell' });
    const blvd = ARTERIAL_SEGMENTS.find((s) => s.id === 'blvd')!;
    const lane = lanePath(blvd, true);
    for (let tick = 0; tick <= maxTickOf(trace); tick++) {
      const convoy = convoyAt(trace, tick)!;
      expect(convoy.position.z).toBeCloseTo(lane[0]!.z, 6);
      expect(convoy.position.x).toBeGreaterThanOrEqual(lane[0]!.x);
      expect(convoy.position.x).toBeLessThanOrEqual(lane[lane.length - 1]!.x);
      expect(convoy.heading).toBeCloseTo(Math.PI / 2, 6);
    }
  });

  it('waits at the QPU gate once execution begins, and stays there through results', async () => {
    const { trace } = await compiledPipelineTrace({ sampleId: 'ghz-4' });
    const executionTick = trace.events.find((e) => e.stage === 'execution')!.logicalTick;
    const atExecution = convoyAt(trace, executionTick)!;
    expect(atExecution.position.x).toBeCloseTo(QPU_GATE.x, 6);
    // execution.completed carries stage 'result'; the convoy must not drive
    // backward toward the Observatory.
    const atEnd = convoyAt(trace, maxTickOf(trace))!;
    expect(atEnd.position.x).toBeCloseTo(QPU_GATE.x, 6);
  });

  it('arrives at each compile district exactly when its stage is reached', async () => {
    const { trace } = await compiledPipelineTrace({
      sampleId: 'swap-storm',
      layoutMethod: 'trivial',
    });
    const layoutTick = trace.events.find((e) => e.stage === 'layout')!.logicalTick;
    const routingTick = trace.events.find((e) => e.stage === 'routing')!.logicalTick;
    expect(convoyAt(trace, layoutTick)!.position.x).toBeCloseTo(
      LANDMARK_SITES['layout-exchange'].anchor[0],
      6,
    );
    expect(convoyAt(trace, routingTick)!.position.x).toBeCloseTo(
      LANDMARK_SITES['routing-transit'].anchor[0],
      6,
    );
  });
});

describe('classical couriers (W3.2)', () => {
  function courierTrace(withClassical: boolean): Trace {
    const builder = fixtureBuilder(`courier-${withClassical}`);
    // Ticks 1..4: filler gates so the measurement lands mid-trace.
    for (let i = 0; i < 4; i++) {
      builder.emit({
        eventType: 'gate.executed',
        stage: 'execution',
        source: 'exact_simulation',
        certainty: 'EXACT',
        physicalQubits: [0],
        payload: { gate: 'x', phase: 'physical-ideal' },
      });
    }
    builder.emit({
      eventType: 'measurement.sampled',
      stage: 'measurement',
      source: 'sampled_simulation',
      physicalQubits: [0],
      payload: { clbit: 0, outcome: 1, phase: 'physical-ideal' },
    });
    if (withClassical) {
      // Feed-forward evaluated two ticks after the measurement.
      builder.emit({
        eventType: 'gate.executed',
        stage: 'execution',
        source: 'exact_simulation',
        certainty: 'EXACT',
        physicalQubits: [1],
        payload: { gate: 'x', phase: 'physical-ideal' },
      });
      builder.emit({
        eventType: 'classical.condition_evaluated',
        stage: 'classical',
        source: 'sampled_simulation',
        payload: { creg: 'c', expected: 1, actual: 1, satisfied: true },
      });
    } else {
      for (let i = 0; i < 4; i++) {
        builder.emit({
          eventType: 'gate.executed',
          stage: 'execution',
          source: 'exact_simulation',
          certainty: 'EXACT',
          physicalQubits: [1],
          payload: { gate: 'x', phase: 'physical-ideal' },
        });
      }
    }
    return buildFixture(builder);
  }

  it('spawns at the measurement tick carrying the measured bit', () => {
    const trace = courierTrace(false);
    const spawn = trace.events.find((e) => e.eventType === 'measurement.sampled')!.logicalTick;
    expect(couriersAt(trace, spawn - 1)).toEqual([]);
    const couriers = couriersAt(trace, spawn);
    expect(couriers).toHaveLength(1);
    expect(couriers[0]!.kind).toBe('courier');
    expect(couriers[0]!.label).toBe('c0 = 1');
    expect(couriers[0]!.position.x).toBeCloseTo(LANDMARK_SITES['measurement-harbor'].anchor[0], 6);
  });

  it('advances along the south collector toward the Classical Control Center', () => {
    const trace = courierTrace(false);
    const spawn = trace.events.find((e) => e.eventType === 'measurement.sampled')!.logicalTick;
    const start = couriersAt(trace, spawn)[0]!;
    const mid = couriersAt(trace, spawn + 1)[0]!;
    const later = couriersAt(trace, spawn + 2)[0]!;
    // The harbor is east of the control center, so x strictly decreases.
    expect(mid.position.x).toBeLessThan(start.position.x);
    expect(later.position.x).toBeLessThan(mid.position.x);
    expect(later.position.x).toBeGreaterThan(LANDMARK_SITES['classical-control'].anchor[0]);
    expect(mid.position.z).toBe(start.position.z);
    expect(mid.heading).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('is absent after arriving at the end of its fixed journey', () => {
    const trace = courierTrace(false);
    const spawn = trace.events.find((e) => e.eventType === 'measurement.sampled')!.logicalTick;
    expect(couriersAt(trace, spawn + COURIER_JOURNEY_TICKS)).toEqual([]);
  });

  it('completes its journey at feed-forward evaluation', () => {
    const trace = courierTrace(true);
    const spawn = trace.events.find((e) => e.eventType === 'measurement.sampled')!.logicalTick;
    const classicalTick = trace.events.find(
      (e) => e.eventType === 'classical.condition_evaluated',
    )!.logicalTick;
    expect(classicalTick - spawn).toBeLessThan(COURIER_JOURNEY_TICKS);
    // Still en route one tick before evaluation, arrived at evaluation.
    expect(couriersAt(trace, classicalTick - 1)).toHaveLength(1);
    expect(couriersAt(trace, classicalTick)).toEqual([]);
  });

  it('returns no couriers without a trace', () => {
    expect(couriersAt(null, 3)).toEqual([]);
  });
});

describe('ambient traffic (W3.3)', () => {
  it('is deterministic in animation time', () => {
    for (const time of [0, 7.25, 123.4]) {
      expect(ambientVehiclesAt(time, false)).toEqual(ambientVehiclesAt(time, false));
    }
  });

  it('is empty under reduced motion', () => {
    expect(ambientVehiclesAt(12, true)).toEqual([]);
  });

  it('keeps every ambient car inside arterial road corridors at all times', () => {
    for (const time of [0, 3.7, 42, 999.5]) {
      const cars = ambientVehiclesAt(time, false);
      // Five loops: three interior rings plus both boulevard directions.
      expect(cars).toHaveLength(48);
      for (const car of cars) {
        expect(car.kind).toBe('ambient-car');
        expect(withinSomeCorridor(car.position), `car ${car.id} at t=${time}`).toBe(true);
      }
    }
  });

  it('actually moves cars as time advances', () => {
    const before = ambientVehiclesAt(0, false);
    const after = ambientVehiclesAt(5, false);
    const moved = before.filter(
      (car, i) =>
        Math.hypot(car.position.x - after[i]!.position.x, car.position.z - after[i]!.position.z) >
        1,
    );
    expect(moved.length).toBe(before.length);
  });
});

describe('pedestrians and district activity (W3.3)', () => {
  function activityTrace(): Trace {
    const builder = fixtureBuilder('activity');
    builder.emit({
      eventType: 'gate.executed',
      stage: 'execution',
      source: 'exact_simulation',
      certainty: 'EXACT',
      physicalQubits: [0, 1],
      payload: { gate: 'cx', phase: 'physical-ideal' },
    });
    return buildFixture(builder);
  }

  it('reports activity only for districts with events at the tick', () => {
    const trace = activityTrace();
    const tick = trace.events[0]!.logicalTick;
    const activity = districtActivityAt(trace, tick);
    expect(activity.get('qpu-grid')).toBeGreaterThan(0);
    expect(activity.get('program-port')).toBe(0);
    for (const level of activity.values()) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('reports zero activity everywhere without a trace', () => {
    const activity = districtActivityAt(null, 0);
    expect(activity.size).toBeGreaterThan(0);
    for (const level of activity.values()) expect(level).toBe(0);
  });

  it('raises pedestrian density in the active district', () => {
    const trace = activityTrace();
    const tick = trace.events[0]!.logicalTick;
    const pedestrians = pedestriansAt(trace, tick, 4, false);
    const inQpu = pedestrians.filter((p) => p.id.startsWith('ped:qpu-grid:'));
    const inPort = pedestrians.filter((p) => p.id.startsWith('ped:program-port:'));
    expect(inQpu.length).toBeGreaterThan(inPort.length);
    expect(inPort.length).toBeGreaterThanOrEqual(1);
    expect(inQpu.length).toBeLessThanOrEqual(6);
  });

  it('keeps figures on the sidewalk loop around their district landmark', () => {
    const trace = activityTrace();
    const pedestrians = pedestriansAt(trace, 1, 9.5, false);
    for (const figure of pedestrians) {
      const districtId = figure.id.split(':')[1]! as keyof typeof LANDMARK_SITES;
      const site = LANDMARK_SITES[districtId];
      expect(Math.abs(figure.position.x - site.anchor[0])).toBeLessThanOrEqual(
        site.clearHalfW + 3 + 1e-6,
      );
      expect(Math.abs(figure.position.z - site.anchor[1])).toBeLessThanOrEqual(
        site.clearHalfD + 3 + 1e-6,
      );
    }
  });

  it('is deterministic and empty under reduced motion or without a trace', () => {
    const trace = activityTrace();
    expect(pedestriansAt(trace, 1, 2.5, false)).toEqual(pedestriansAt(trace, 1, 2.5, false));
    expect(pedestriansAt(trace, 1, 2.5, true)).toEqual([]);
    expect(pedestriansAt(null, 1, 2.5, false)).toEqual([]);
  });
});

describe('sidewalk strollers (W3.3)', () => {
  it('populates every arterial pavement deterministically and pauses under reduced motion', () => {
    const a = strollersAt(4.25, false);
    const b = strollersAt(4.25, false);
    expect(a.length).toBeGreaterThan(40);
    expect(a).toEqual(b);
    expect(strollersAt(4.25, true)).toEqual([]);
  });

  it('walks the boulevard pavements, clear of the carriageway', () => {
    const blvd = ARTERIAL_SEGMENTS.find((s) => s.id === 'blvd')!;
    const onBoulevard = strollersAt(6, false).filter((s) => s.id.startsWith('stroll:blvd:'));
    expect(onBoulevard.length).toBeGreaterThanOrEqual(10);
    for (const walker of onBoulevard) {
      const offset = Math.abs(walker.position.z - blvd.a.z);
      // Outside the carriageway, but still on the street, not in a block.
      expect(offset, walker.id).toBeGreaterThan(blvd.width / 2);
      expect(offset, walker.id).toBeLessThan(blvd.width / 2 + 6);
      expect(walker.position.x).toBeGreaterThanOrEqual(Math.min(blvd.a.x, blvd.b.x));
      expect(walker.position.x).toBeLessThanOrEqual(Math.max(blvd.a.x, blvd.b.x));
    }
  });

  it('keeps walkers moving and turns them at the ends instead of teleporting', () => {
    const t0 = strollersAt(0, false);
    const t1 = strollersAt(1.5, false);
    const byId = new Map(t1.map((s) => [s.id, s]));
    for (const before of t0) {
      const after = byId.get(before.id)!;
      const step = Math.hypot(
        after.position.x - before.position.x,
        after.position.z - before.position.z,
      );
      // A 1.5 s step at walking pace: never a jump across the segment.
      expect(step, before.id).toBeLessThan(6);
    }
  });
});
