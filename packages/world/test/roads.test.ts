import { describe, expect, it } from 'vitest';
import {
  ARTERIAL_SEGMENTS,
  buildRoadGraph,
  computeJunctions,
  corridorRect,
  lanePath,
  lampPositions,
  nearestNode,
  reachableNodes,
} from '../src/roads.js';
import { DISTRICTS } from '../src/districts.js';
import { cityPlan } from '../src/city-plan.js';

describe('road network', () => {
  it('forms a single connected arterial network (W1.3)', () => {
    const graph = buildRoadGraph(ARTERIAL_SEGMENTS);
    const reachable = reachableNodes(graph, 0);
    expect(reachable.size).toBe(graph.nodes.length);
    expect(graph.nodes.length).toBeGreaterThan(20);
  });

  it('puts an arterial node within reach of every district (W1.3)', () => {
    const graph = buildRoadGraph(ARTERIAL_SEGMENTS);
    for (const district of DISTRICTS) {
      const node = graph.nodes[nearestNode(graph, { x: district.bounds.x, z: district.bounds.z })]!;
      const d = Math.hypot(node.x - district.bounds.x, node.z - district.bounds.z);
      // Every district center is within a block or two of an arterial node.
      expect(d, district.id).toBeLessThanOrEqual(110);
    }
  });

  it('detects junctions where segments cross', () => {
    const junctions = computeJunctions(ARTERIAL_SEGMENTS);
    // The boulevard crosses every north-south avenue between its endpoints.
    expect(junctions.length).toBeGreaterThanOrEqual(15);
    for (const junction of junctions) {
      expect(junction.segmentIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('offsets lane paths to the driving side and keeps direction', () => {
    const boulevard = ARTERIAL_SEGMENTS.find((s) => s.id === 'blvd')!;
    const east = lanePath(boulevard, true);
    const west = lanePath(boulevard, false);
    expect(east[0]!.x).toBeLessThan(east[east.length - 1]!.x);
    expect(west[0]!.x).toBeGreaterThan(west[west.length - 1]!.x);
    // Right-hand traffic: eastbound lane sits south of the centerline
    // (positive z is south), westbound north.
    expect(east[0]!.z).toBeLessThan(boulevard.a.z);
    expect(west[0]!.z).toBeGreaterThan(boulevard.a.z);
  });

  it('spaces lamps along major roads', () => {
    const boulevard = ARTERIAL_SEGMENTS.find((s) => s.id === 'blvd')!;
    const lamps = lampPositions(boulevard);
    expect(lamps.length).toBeGreaterThan(10);
  });

  it('keeps arterial corridors off the landmark anchors', () => {
    const corridors = ARTERIAL_SEGMENTS.map(corridorRect);
    const plan = cityPlan();
    for (const parcel of plan.parcels) {
      for (const corridor of corridors) {
        const overlap =
          parcel.rect.minX < corridor.maxX - 0.01 &&
          parcel.rect.maxX > corridor.minX + 0.01 &&
          parcel.rect.minZ < corridor.maxZ - 0.01 &&
          parcel.rect.maxZ > corridor.minZ + 0.01;
        expect(overlap, `${parcel.id} vs corridor`).toBe(false);
      }
    }
  });

  it('generates local streets and includes them in the plan', () => {
    const plan = cityPlan();
    const locals = plan.segments.filter((s) => s.roadClass === 'local');
    expect(locals.length).toBeGreaterThan(8);
  });

  it('marks crosswalks at major junctions', () => {
    const plan = cityPlan();
    expect(plan.crosswalks.length).toBeGreaterThanOrEqual(8);
  });
});
