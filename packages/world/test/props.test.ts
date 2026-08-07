import { describe, expect, it } from 'vitest';
import { cityPlan } from '../src/city-plan.js';
import { QPU_CAMPUS, QPU_GATE } from '../src/props.js';
import { generateBuildings } from '../src/buildings.js';

describe('props', () => {
  const plan = cityPlan();

  it('places lamps, trees, benches, containers, and parked cars (W1.9)', () => {
    const byKind = new Map<string, number>();
    for (const prop of plan.props) {
      byKind.set(prop.kind, (byKind.get(prop.kind) ?? 0) + 1);
    }
    expect(byKind.get('lamp') ?? 0).toBeGreaterThan(40);
    expect(byKind.get('tree') ?? 0).toBeGreaterThan(60);
    expect(byKind.get('bench') ?? 0).toBeGreaterThan(5);
    expect(byKind.get('container') ?? 0).toBeGreaterThan(20);
    expect(byKind.get('parked-car') ?? 0).toBeGreaterThan(10);
    expect(byKind.get('ship') ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('rings the QPU campus with fence posts, leaving the gate open (W1.9)', () => {
    const posts = plan.props.filter((p) => p.kind === 'fence-post');
    expect(posts.length).toBeGreaterThan(40);
    const gatePosts = posts.filter(
      (p) =>
        Math.abs(p.position.x - QPU_GATE.x) < 0.5 &&
        p.position.z > QPU_GATE.minZ &&
        p.position.z < QPU_GATE.maxZ,
    );
    expect(gatePosts).toHaveLength(0);
    for (const post of posts) {
      const onPerimeter =
        Math.abs(post.position.x - QPU_CAMPUS.minX) < 0.5 ||
        Math.abs(post.position.x - QPU_CAMPUS.maxX) < 0.5 ||
        Math.abs(post.position.z - QPU_CAMPUS.minZ) < 0.5 ||
        Math.abs(post.position.z - QPU_CAMPUS.maxZ) < 0.5;
      expect(onPerimeter).toBe(true);
    }
  });

  it('keeps trees and benches out of building footprints', () => {
    const buildings = generateBuildings();
    for (const prop of plan.props) {
      if (prop.kind !== 'tree' && prop.kind !== 'bench') continue;
      for (const building of buildings) {
        const inside =
          Math.abs(prop.position.x - building.position[0]) <
            building.collisionHalfExtents[0] - 0.5 &&
          Math.abs(prop.position.z - building.position[1]) < building.collisionHalfExtents[1] - 0.5;
        expect(inside, `${prop.kind} inside ${building.id}`).toBe(false);
      }
    }
  });

  it('gives every prop a variant in [0, 1)', () => {
    for (const prop of plan.props) {
      expect(prop.variant).toBeGreaterThanOrEqual(0);
      expect(prop.variant).toBeLessThan(1);
    }
  });

  it('is deterministic (memoized plan)', () => {
    expect(cityPlan()).toBe(plan);
  });
});
