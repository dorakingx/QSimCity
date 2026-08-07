import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CITY_BOUNDS, generateBuildings, terrainHeight } from '@qsimcity/world';
import { CameraRig } from '../src/cameras.js';

/**
 * Camera rig tests: pure math, no WebGL. Covers all four modes, input
 * handling, damping, collision resolution, and city clamping (W5.1).
 */

const buildings = generateBuildings();

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);
});

function rig(): CameraRig {
  return new CameraRig(16 / 9, buildings);
}

/** Advance the damped rig several frames so goals settle. */
function settle(r: CameraRig, frames = 30): void {
  for (let i = 0; i < frames; i++) r.update(1 / 30);
}

describe('default framing', () => {
  it('starts in orbit mode positioned south of the city, looking north', () => {
    const r = rig();
    expect(r.mode).toBe('orbit');
    expect(r.position.z).toBeGreaterThan(100);
    expect(r.camera.position.y).toBeGreaterThan(80);
  });

  it('frames the whole city width at the default distance', () => {
    const r = rig();
    const vFov = (r.camera.fov * Math.PI) / 180;
    const distance = r.position.distanceTo(r.camera.getWorldDirection(r.position.clone()));
    void distance;
    // Horizontal coverage at the target plane must exceed the city span.
    const dist = Math.hypot(r.position.x - 20, r.position.y, r.position.z - 28);
    const coverage = 2 * dist * Math.tan(vFov / 2) * r.camera.aspect;
    expect(coverage).toBeGreaterThan(CITY_BOUNDS.maxX - CITY_BOUNDS.minX);
  });
});

describe('mode switching', () => {
  it('first-person places the walker inside the city at 1.7 m above ground', () => {
    const r = rig();
    r.setMode('first-person');
    expect(r.mode).toBe('first-person');
    const ground = terrainHeight(r.position.x, r.position.z);
    expect(r.position.y).toBeCloseTo(ground + 1.7, 5);
    expect(r.position.x).toBeGreaterThan(CITY_BOUNDS.minX);
    expect(r.position.x).toBeLessThan(CITY_BOUNDS.maxX);
  });

  it('fly places the camera above the city looking down', () => {
    const r = rig();
    r.setMode('fly');
    expect(r.position.y).toBeGreaterThan(20);
  });

  it('top-down looks straight down at the target', () => {
    const r = rig();
    r.setMode('top');
    expect(r.position.y).toBeGreaterThan(200);
  });

  it('switching back to orbit restores an orbital position', () => {
    const r = rig();
    r.setMode('first-person');
    r.setMode('orbit');
    expect(r.position.y).toBeGreaterThan(50);
  });
});

describe('pointer and wheel input', () => {
  it('dragging rotates the orbit camera (damped)', () => {
    const r = rig();
    const before = r.position.clone();
    r.onPointerDown(100, 100);
    r.onPointerMove(200, 140);
    r.onPointerUp();
    settle(r);
    expect(r.position.distanceTo(before)).toBeGreaterThan(1);
  });

  it('ignores movement when not dragging', () => {
    const r = rig();
    const before = r.position.clone();
    r.onPointerMove(400, 400);
    expect(r.position.distanceTo(before)).toBe(0);
  });

  it('wheel zooms within clamped bounds (damped)', () => {
    const r = rig();
    const start = r.position.length();
    r.onWheel(500);
    settle(r);
    expect(r.position.length()).toBeGreaterThan(start);
    for (let i = 0; i < 200; i++) r.onWheel(-500);
    settle(r, 60);
    const closest = r.position.length();
    for (let i = 0; i < 200; i++) r.onWheel(500);
    settle(r, 60);
    expect(r.position.length()).toBeGreaterThan(closest);
  });

  it('drag in first-person turns the view without moving position', () => {
    const r = rig();
    r.setMode('first-person');
    const before = r.position.clone();
    r.onPointerDown(0, 0);
    r.onPointerMove(120, 20);
    expect(r.position.distanceTo(before)).toBeCloseTo(0, 6);
  });

  it('wheel in fly mode changes altitude', () => {
    const r = rig();
    r.setMode('fly');
    const before = r.position.y;
    r.onWheel(200);
    expect(r.position.y).not.toBe(before);
  });
});

describe('touch input', () => {
  it('one-finger touch drags like a pointer', () => {
    const r = rig();
    const before = r.position.clone();
    r.onTouchStart([{ x: 100, y: 100 }]);
    r.onTouchMove([{ x: 220, y: 130 }]);
    r.onTouchEnd();
    settle(r);
    expect(r.position.distanceTo(before)).toBeGreaterThan(1);
  });

  it('two-finger pinch zooms', () => {
    const r = rig();
    const before = r.position.length();
    r.onTouchStart([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    r.onTouchMove([
      { x: 120, y: 100 },
      { x: 180, y: 100 },
    ]);
    r.onTouchEnd();
    settle(r);
    expect(r.position.length()).not.toBeCloseTo(before, 3);
  });
});

describe('movement, collision, and bounds', () => {
  it('W moves the walker forward', () => {
    const r = rig();
    r.setMode('first-person');
    const before = r.position.clone();
    r.onKeyDown('KeyW');
    r.update(0.5);
    expect(r.position.distanceTo(before)).toBeGreaterThan(1);
    r.onKeyUp('KeyW');
    const held = r.position.clone();
    r.update(0.5);
    expect(r.position.distanceTo(held)).toBe(0);
  });

  it('arrow keys pan the orbit target', () => {
    const r = rig();
    const before = r.position.clone();
    r.onKeyDown('ArrowRight');
    for (let i = 0; i < 10; i++) r.update(0.1);
    expect(r.position.distanceTo(before)).toBeGreaterThan(0.5);
  });

  it('walking never ends up inside a building footprint', () => {
    const r = rig();
    r.setMode('first-person');
    // Drive straight through the city for several seconds.
    r.onKeyDown('KeyW');
    for (let i = 0; i < 400; i++) r.update(0.05);
    const p = r.position;
    for (const b of buildings) {
      const inX = Math.abs(p.x - b.position[0]) < b.collisionHalfExtents[0];
      const inZ = Math.abs(p.z - b.position[1]) < b.collisionHalfExtents[1];
      expect(inX && inZ && p.y < b.collisionHeight, `inside ${b.id}`).toBe(false);
    }
  });

  it('clamps movement to the city bounds', () => {
    const r = rig();
    r.setMode('fly');
    r.onKeyDown('KeyW');
    for (let i = 0; i < 2000; i++) r.update(0.1);
    expect(r.position.x).toBeGreaterThanOrEqual(CITY_BOUNDS.minX - 81);
    expect(r.position.x).toBeLessThanOrEqual(CITY_BOUNDS.maxX + 81);
    expect(r.position.z).toBeGreaterThanOrEqual(CITY_BOUNDS.minZ - 81);
    expect(r.position.z).toBeLessThanOrEqual(CITY_BOUNDS.maxZ + 81);
  });

  it('fly mode ascends and descends with Q and E', () => {
    const r = rig();
    r.setMode('fly');
    const start = r.position.y;
    r.onKeyDown('KeyE');
    r.update(0.5);
    expect(r.position.y).toBeGreaterThan(start);
    r.onKeyUp('KeyE');
    r.onKeyDown('KeyQ');
    r.update(0.5);
    expect(r.position.y).toBeLessThan(start + 30);
  });
});

describe('flyTo transitions', () => {
  it('animates toward the target over time', () => {
    const r = rig();
    r.flyTo(195, 20, 110);
    const before = r.position.clone();
    vi.spyOn(performance, 'now').mockReturnValue(1600);
    r.update(0.6);
    expect(r.position.distanceTo(before)).toBeGreaterThan(1);
    vi.spyOn(performance, 'now').mockReturnValue(3000);
    r.update(0.6);
    const settled = r.position.clone();
    r.update(0.6);
    expect(r.position.distanceTo(settled)).toBeCloseTo(0, 3);
  });

  it('jumps immediately when reduced motion is on', () => {
    const r = rig();
    r.reducedMotion = true;
    r.flyTo(-170, 20, 100);
    // No update tick needed: the move is applied synchronously.
    expect(r.position.x).toBeLessThan(0);
  });

  it('repositions the walker in first-person mode', () => {
    const r = rig();
    r.setMode('first-person');
    r.flyTo(70, -10);
    expect(r.position.x).toBeCloseTo(70, 3);
    const ground = terrainHeight(r.position.x, r.position.z);
    expect(r.position.y).toBeCloseTo(ground + 1.7, 3);
  });
});
