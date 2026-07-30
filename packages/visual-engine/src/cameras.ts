import * as THREE from 'three';
import { CITY_BOUNDS, type Building } from '@qsimcity/world';

/**
 * Camera controllers: orbit, top-down, fly, first-person walk. All input
 * (mouse, keyboard, touch, trackpad) funnels through one handler set.
 * First-person and fly collide against building AABBs and the city bounds.
 */

export type CameraMode = 'orbit' | 'top' | 'fly' | 'first-person';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 18; // units/second
const FLY_SPEED = 40;

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
  /** Orbit state. */
  private target = new THREE.Vector3(0, 0, 40);
  private distance = 260;
  private azimuth = -Math.PI / 2;
  private polar = 0.9;
  /** First-person / fly state. */
  private fpPosition = new THREE.Vector3(-190, EYE_HEIGHT, 40);
  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private pinchDistance = 0;
  private readonly aabbs: Aabb[];
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
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.5, 1500);
    this.aabbs = buildings.map((b) => ({
      minX: b.position[0] - b.collisionHalfExtents[0],
      maxX: b.position[0] + b.collisionHalfExtents[0],
      minZ: b.position[1] - b.collisionHalfExtents[1],
      maxZ: b.position[1] + b.collisionHalfExtents[1],
      height: b.collisionHeight,
    }));
    this.updateCamera();
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === 'first-person') {
      this.fpPosition.y = EYE_HEIGHT;
      this.yaw = this.azimuth + Math.PI;
      this.pitch = 0;
    } else if (mode === 'fly') {
      this.fpPosition.copy(this.camera.position);
      this.fpPosition.y = Math.max(12, this.fpPosition.y);
    }
    this.updateCamera();
  }

  /** Smoothly move the orbit target (tour and inspector focus). */
  flyTo(x: number, z: number, distance = 90): void {
    if (this.mode === 'first-person' || this.mode === 'fly') {
      this.fpPosition.set(x, this.mode === 'first-person' ? EYE_HEIGHT : 40, z + 40);
      this.yaw = Math.PI;
      this.updateCamera();
      return;
    }
    if (this.reducedMotion) {
      this.target.set(x, 0, z);
      this.distance = distance;
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
      this.azimuth -= dx * 0.005;
      if (this.mode === 'orbit') {
        this.polar = THREE.MathUtils.clamp(this.polar - dy * 0.005, 0.15, 1.45);
      }
    } else {
      this.yaw -= dx * 0.0035;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0035, -1.4, 1.4);
    }
    this.updateCamera();
  }

  onWheel(deltaY: number): void {
    if (this.mode === 'orbit' || this.mode === 'top') {
      this.distance = THREE.MathUtils.clamp(this.distance * (1 + deltaY * 0.001), 25, 600);
    } else if (this.mode === 'fly') {
      this.fpPosition.y = THREE.MathUtils.clamp(this.fpPosition.y + deltaY * 0.05, 6, 300);
    }
    this.updateCamera();
  }

  onTouchStart(touches: { x: number; y: number }[]): void {
    if (touches.length === 1) this.onPointerDown(touches[0]!.x, touches[0]!.y);
    else if (touches.length === 2) {
      this.dragging = false;
      this.pinchDistance = Math.hypot(
        touches[0]!.x - touches[1]!.x,
        touches[0]!.y - touches[1]!.y,
      );
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
      this.distance = THREE.MathUtils.lerp(this.tween.fromDistance, this.tween.toDistance, ease);
      if (t >= 1) this.tween = null;
      this.updateCamera();
    }
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    let move = new THREE.Vector3();
    const speed = this.mode === 'first-person' ? WALK_SPEED : FLY_SPEED;
    const up = this.keys.has('KeyE') ? 1 : this.keys.has('KeyQ') ? -1 : 0;
    const fwd =
      this.keys.has('KeyW') || this.keys.has('ArrowUp')
        ? 1
        : this.keys.has('KeyS') || this.keys.has('ArrowDown')
          ? -1
          : 0;
    const strafe =
      this.keys.has('KeyD') || this.keys.has('ArrowRight')
        ? 1
        : this.keys.has('KeyA') || this.keys.has('ArrowLeft')
          ? -1
          : 0;
    if (fwd === 0 && strafe === 0 && up === 0) return;

    if (this.mode === 'orbit' || this.mode === 'top') {
      // Pan the target in view space.
      forward.set(Math.cos(this.azimuth), 0, Math.sin(this.azimuth));
      right.set(-forward.z, 0, forward.x);
      move = forward
        .multiplyScalar(-fwd * speed * dt)
        .add(right.multiplyScalar(strafe * speed * dt));
      this.target.add(move);
      this.clampToCity(this.target);
      this.updateCamera();
      return;
    }
    forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    right.set(forward.z, 0, -forward.x);
    move = forward
      .multiplyScalar(fwd * speed * dt)
      .add(right.multiplyScalar(strafe * speed * dt));
    if (this.mode === 'fly') move.y = up * speed * dt;
    const next = this.fpPosition.clone().add(move);
    if (this.mode === 'first-person') {
      next.y = EYE_HEIGHT;
      this.resolveCollision(next);
    } else {
      next.y = THREE.MathUtils.clamp(next.y, 6, 300);
    }
    this.clampToCity(next);
    this.fpPosition.copy(next);
    this.updateCamera();
  }

  /** Push a walking position out of any building footprint (spec §14). */
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
    v.x = THREE.MathUtils.clamp(v.x, CITY_BOUNDS.minX - 40, CITY_BOUNDS.maxX + 40);
    v.z = THREE.MathUtils.clamp(v.z, CITY_BOUNDS.minZ - 40, CITY_BOUNDS.maxZ + 40);
  }

  private updateCamera(): void {
    switch (this.mode) {
      case 'orbit': {
        const sinP = Math.sin(this.polar);
        this.camera.position.set(
          this.target.x + this.distance * sinP * Math.cos(this.azimuth),
          this.distance * Math.cos(this.polar) + 4,
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
}
