import * as THREE from 'three';
import {
  ARTERIAL_SEGMENTS,
  CITY_BOUNDS,
  EAST_COAST_X,
  INTERIOR_BUILDING_IDS,
  INTERIORS,
  interiorCollisionBoxes,
  WEST_COAST_X,
  terrainHeight,
  type Building,
} from '@qsimcity/world';

/**
 * Camera controllers: orbit, top-down, fly, first-person walk (spec §6).
 * All input (mouse, keyboard, touch, trackpad) funnels through one handler
 * set. Orbit and top-down are damped; walking collides against building
 * AABBs, the quay edges, and the city bounds, at a human 1.7 m eye height.
 */

export type CameraMode = 'orbit' | 'top' | 'fly' | 'first-person';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 7; // brisk human pace, units/second
const FLY_SPEED = 62;
/** How quickly damped values approach their target (per second). */
const DAMPING = 7;

interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'orbit';
  /** Damped orbit state: current values chase the target values. */
  private target = new THREE.Vector3(30, 0, 62);
  private targetGoal = this.target.clone();
  private distance = 640;
  private distanceGoal = 640;
  private azimuth = Math.PI / 2;
  private azimuthGoal = Math.PI / 2;
  private polar = 0.72;
  private polarGoal = 0.72;
  /** First-person / fly state. */
  private fpPosition = new THREE.Vector3(-330, EYE_HEIGHT, 70);
  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pinchDistance = 0;
  private readonly aabbs: Aabb[];
  /** External movement input in [-1,1], e.g. from touch joysticks. */
  moveAxis = { forward: 0, strafe: 0, lift: 0 };
  private tween: {
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromDistance: number;
    toDistance: number;
    start: number;
    duration: number;
  } | null = null;
  reducedMotion = false;

  constructor(aspect: number, buildings: readonly Building[]) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.5, 4000);
    // Buildings with enterable interiors collide as wall segments with a
    // door gap; every other building is a solid box (W1.8).
    this.aabbs = buildings.flatMap((b) => {
      const interiorId = INTERIOR_BUILDING_IDS[b.id];
      const height = b.collisionHeight + terrainHeight(b.position[0], b.position[1]);
      if (interiorId) {
        const interior = INTERIORS.find((i) => i.id === interiorId);
        if (interior) {
          return interiorCollisionBoxes(interior).map((box) => ({ ...box, height }));
        }
      }
      return [
        {
          minX: b.position[0] - b.collisionHalfExtents[0],
          maxX: b.position[0] + b.collisionHalfExtents[0],
          minZ: b.position[1] - b.collisionHalfExtents[1],
          maxZ: b.position[1] + b.collisionHalfExtents[1],
          height,
        },
      ];
    });
    this.updateCamera();
  }

  setMode(mode: CameraMode): void {
    const previous = this.mode;
    this.mode = mode;
    if (mode === 'first-person') {
      if (previous === 'orbit' || previous === 'top') {
        // Step onto the nearest street: snap to the closest arterial
        // centerline point and face along the road, so the walker always
        // starts standing in a street with a clear view — never inside a
        // block or facing a wall.
        let bestX = this.target.x;
        let bestZ = this.target.z;
        let bestYaw = 0;
        let bestDistance = Infinity;
        for (const segment of ARTERIAL_SEGMENTS) {
          const ax = segment.a.x;
          const az = segment.a.z;
          const dx = segment.b.x - ax;
          const dz = segment.b.z - az;
          const lengthSq = dx * dx + dz * dz;
          const t = Math.max(
            0.05,
            Math.min(
              0.95,
              ((this.target.x - ax) * dx + (this.target.z - az) * dz) / Math.max(1e-6, lengthSq),
            ),
          );
          const length = Math.sqrt(lengthSq);
          const ux = dx / Math.max(1e-6, length);
          const uz = dz / Math.max(1e-6, length);
          // Stand in the right-hand driving lane, not on the median.
          const laneOffset = segment.width / 4 + segment.median / 2;
          const px = ax + dx * t + uz * laneOffset;
          const pz = az + dz * t - ux * laneOffset;
          const d = Math.hypot(px - this.target.x, pz - this.target.z);
          if (d < bestDistance) {
            bestDistance = d;
            bestX = px;
            bestZ = pz;
            bestYaw = Math.atan2(dx, dz);
          }
        }
        this.fpPosition.set(bestX, 0, bestZ);
        this.yaw = bestYaw;
        this.pitch = 0.03;
      }
      this.fpPosition.y = terrainHeight(this.fpPosition.x, this.fpPosition.z) + EYE_HEIGHT;
      this.resolveCollision(this.fpPosition);
    } else if (mode === 'fly') {
      if (previous === 'orbit' || previous === 'top') {
        this.fpPosition.set(this.target.x, 90, this.target.z + 170);
        this.yaw = Math.PI;
        this.pitch = -0.4;
      } else {
        this.fpPosition.y = Math.max(16, this.fpPosition.y);
      }
    }
    this.updateCamera();
  }

  /**
   * Place the walker at an exact spot facing an exact direction. Camera-only:
   * used by evidence capture and E2E tests to stand a visitor inside rooms
   * without replaying a whole keyboard walk.
   */
  walkTo(x: number, z: number, yaw: number): void {
    this.mode = 'first-person';
    this.tween = null;
    this.fpPosition.set(x, terrainHeight(x, z) + EYE_HEIGHT, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.updateCamera();
  }

  /** Smoothly move the orbit target (tour and inspector focus). */
  flyTo(x: number, z: number, distance = 220): void {
    if (this.mode === 'first-person' || this.mode === 'fly') {
      this.fpPosition.set(x, this.mode === 'first-person' ? 0 : 70, z + 60);
      if (this.mode === 'first-person') {
        this.fpPosition.y = terrainHeight(x, z + 60) + EYE_HEIGHT;
      }
      this.yaw = Math.PI;
      this.updateCamera();
      return;
    }
    if (this.reducedMotion) {
      this.target.set(x, 0, z);
      this.targetGoal.copy(this.target);
      this.distance = distance;
      this.distanceGoal = distance;
      this.updateCamera();
      return;
    }
    this.tween = {
      fromTarget: this.target.clone(),
      toTarget: new THREE.Vector3(x, 0, z),
      fromDistance: this.distance,
      toDistance: distance,
      start: performance.now(),
      duration: 1200,
    };
  }

  onKeyDown(code: string): void {
    this.keys.add(code);
  }

  onKeyUp(code: string): void {
    this.keys.delete(code);
  }

  onPointerDown(x: number, y: number): void {
    this.dragging = true;
    this.lastPointer = { x, y };
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  onPointerMove(x: number, y: number): void {
    if (!this.dragging) return;
    const dx = x - this.lastPointer.x;
    const dy = y - this.lastPointer.y;
    this.lastPointer = { x, y };
    if (this.mode === 'orbit' || this.mode === 'top') {
      this.azimuthGoal -= dx * 0.005;
      if (this.mode === 'orbit') {
        this.polarGoal = THREE.MathUtils.clamp(this.polarGoal - dy * 0.005, 0.12, 1.45);
      }
      if (this.reducedMotion) {
        this.azimuth = this.azimuthGoal;
        this.polar = this.polarGoal;
        this.updateCamera();
      }
    } else {
      this.yaw -= dx * 0.0035;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0035, -1.4, 1.4);
      this.updateCamera();
    }
  }

  onWheel(deltaY: number): void {
    if (this.mode === 'orbit' || this.mode === 'top') {
      this.distanceGoal = THREE.MathUtils.clamp(this.distanceGoal * (1 + deltaY * 0.001), 30, 1500);
      if (this.reducedMotion) {
        this.distance = this.distanceGoal;
        this.updateCamera();
      }
    } else if (this.mode === 'fly') {
      this.fpPosition.y = THREE.MathUtils.clamp(this.fpPosition.y + deltaY * 0.05, 8, 500);
      this.updateCamera();
    }
  }

  onTouchStart(touches: { x: number; y: number }[]): void {
    if (touches.length === 1) this.onPointerDown(touches[0]!.x, touches[0]!.y);
    else if (touches.length === 2) {
      this.dragging = false;
      this.pinchDistance = Math.hypot(touches[0]!.x - touches[1]!.x, touches[0]!.y - touches[1]!.y);
    }
  }

  onTouchMove(touches: { x: number; y: number }[]): void {
    if (touches.length === 1) this.onPointerMove(touches[0]!.x, touches[0]!.y);
    else if (touches.length === 2) {
      const d = Math.hypot(touches[0]!.x - touches[1]!.x, touches[0]!.y - touches[1]!.y);
      if (this.pinchDistance > 0) this.onWheel((this.pinchDistance - d) * 4);
      this.pinchDistance = d;
    }
  }

  onTouchEnd(): void {
    this.dragging = false;
    this.pinchDistance = 0;
  }

  /** Per-frame update; dt in seconds. */
  update(dt: number): void {
    if (this.tween) {
      const t = Math.min(1, (performance.now() - this.tween.start) / this.tween.duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, ease);
      this.targetGoal.copy(this.target);
      this.distance = THREE.MathUtils.lerp(this.tween.fromDistance, this.tween.toDistance, ease);
      this.distanceGoal = this.distance;
      if (t >= 1) this.tween = null;
      this.updateCamera();
    }

    // Damped approach for orbit values.
    if (this.mode === 'orbit' || this.mode === 'top') {
      const k = this.reducedMotion ? 1 : Math.min(1, dt * DAMPING);
      const changed =
        Math.abs(this.azimuth - this.azimuthGoal) > 1e-5 ||
        Math.abs(this.polar - this.polarGoal) > 1e-5 ||
        Math.abs(this.distance - this.distanceGoal) > 1e-3 ||
        this.target.distanceToSquared(this.targetGoal) > 1e-6;
      if (changed) {
        this.azimuth += (this.azimuthGoal - this.azimuth) * k;
        this.polar += (this.polarGoal - this.polar) * k;
        this.distance += (this.distanceGoal - this.distance) * k;
        this.target.lerp(this.targetGoal, k);
        this.updateCamera();
      }
    }

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    let move: THREE.Vector3;
    const speed = this.mode === 'first-person' ? WALK_SPEED : FLY_SPEED;
    const keyUp = this.keys.has('KeyE') ? 1 : this.keys.has('KeyQ') ? -1 : 0;
    const keyFwd =
      this.keys.has('KeyW') || this.keys.has('ArrowUp')
        ? 1
        : this.keys.has('KeyS') || this.keys.has('ArrowDown')
          ? -1
          : 0;
    const keyStrafe =
      this.keys.has('KeyD') || this.keys.has('ArrowRight')
        ? 1
        : this.keys.has('KeyA') || this.keys.has('ArrowLeft')
          ? -1
          : 0;
    const fwd = THREE.MathUtils.clamp(keyFwd + this.moveAxis.forward, -1, 1);
    const strafe = THREE.MathUtils.clamp(keyStrafe + this.moveAxis.strafe, -1, 1);
    const lift = THREE.MathUtils.clamp(keyUp + this.moveAxis.lift, -1, 1);
    if (fwd === 0 && strafe === 0 && lift === 0) return;

    if (this.mode === 'orbit' || this.mode === 'top') {
      // Pan the target in view space.
      forward.set(Math.cos(this.azimuth), 0, Math.sin(this.azimuth));
      right.set(-forward.z, 0, forward.x);
      const panSpeed = Math.max(40, this.distance * 0.4);
      move = forward
        .multiplyScalar(-fwd * panSpeed * dt)
        .add(right.multiplyScalar(strafe * panSpeed * dt));
      this.targetGoal.add(move);
      this.clampToCity(this.targetGoal);
      // Panning tracks within the same tick so input feels immediate.
      this.target.lerp(this.targetGoal, this.reducedMotion ? 1 : Math.min(1, dt * DAMPING * 2));
      this.updateCamera();
      return;
    }
    forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    right.set(forward.z, 0, -forward.x);
    move = forward.multiplyScalar(fwd * speed * dt).add(right.multiplyScalar(strafe * speed * dt));
    if (this.mode === 'fly') move.y = lift * speed * dt;
    const next = this.fpPosition.clone().add(move);
    if (this.mode === 'first-person') {
      // Keep walkers on land: the quay edge is a hard rail.
      next.x = THREE.MathUtils.clamp(next.x, WEST_COAST_X + 2.5, EAST_COAST_X - 2.5);
      next.y = terrainHeight(next.x, next.z) + EYE_HEIGHT;
      this.resolveCollision(next);
    } else {
      next.y = THREE.MathUtils.clamp(next.y, 8, 500);
    }
    this.clampToCity(next);
    this.fpPosition.copy(next);
    this.updateCamera();
  }

  /** Push a walking position out of any building footprint. */
  private resolveCollision(position: THREE.Vector3): void {
    for (const box of this.aabbs) {
      if (position.y > box.height) continue;
      const margin = 1.0;
      if (
        position.x > box.minX - margin &&
        position.x < box.maxX + margin &&
        position.z > box.minZ - margin &&
        position.z < box.maxZ + margin
      ) {
        // Push out along the axis of least penetration.
        const dxMin = position.x - (box.minX - margin);
        const dxMax = box.maxX + margin - position.x;
        const dzMin = position.z - (box.minZ - margin);
        const dzMax = box.maxZ + margin - position.z;
        const min = Math.min(dxMin, dxMax, dzMin, dzMax);
        if (min === dxMin) position.x = box.minX - margin;
        else if (min === dxMax) position.x = box.maxX + margin;
        else if (min === dzMin) position.z = box.minZ - margin;
        else position.z = box.maxZ + margin;
      }
    }
  }

  private clampToCity(v: THREE.Vector3): void {
    v.x = THREE.MathUtils.clamp(v.x, CITY_BOUNDS.minX - 80, CITY_BOUNDS.maxX + 80);
    v.z = THREE.MathUtils.clamp(v.z, CITY_BOUNDS.minZ - 80, CITY_BOUNDS.maxZ + 80);
  }

  private updateCamera(): void {
    switch (this.mode) {
      case 'orbit': {
        const sinP = Math.sin(this.polar);
        this.camera.position.set(
          this.target.x + this.distance * sinP * Math.cos(this.azimuth),
          this.distance * Math.cos(this.polar) + 6,
          this.target.z + this.distance * sinP * Math.sin(this.azimuth),
        );
        this.camera.lookAt(this.target);
        break;
      }
      case 'top': {
        this.camera.position.set(this.target.x, this.distance, this.target.z + 0.01);
        this.camera.lookAt(this.target);
        break;
      }
      case 'fly':
      case 'first-person': {
        this.camera.position.copy(this.fpPosition);
        const dir = new THREE.Vector3(
          Math.sin(this.yaw) * Math.cos(this.pitch),
          Math.sin(this.pitch),
          Math.cos(this.yaw) * Math.cos(this.pitch),
        );
        this.camera.lookAt(this.fpPosition.clone().add(dir));
        break;
      }
    }
  }

  get position(): THREE.Vector3 {
    return this.camera.position;
  }

  /** Orbit target (for shadow-frustum tracking). */
  get orbitTarget(): THREE.Vector3 {
    return this.target;
  }
}
