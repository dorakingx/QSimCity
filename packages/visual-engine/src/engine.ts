import * as THREE from 'three';
import {
  DISTRICTS,
  districtForStage,
  getDistrict,
  INTERACTIVES,
  qpuPylonPositions,
  terrainHeight,
  hash01,
  type WorldActivity,
} from '@qsimcity/world';
import {
  buildCity,
  buildQpu,
  type CityMeshes,
  type PickTarget,
  type QpuMeshes,
} from './city-builder.js';
import { buildSky, sunDirection, type SkyRig, type TimeOfDay } from './sky.js';
import { CameraRig, type CameraMode } from './cameras.js';

/**
 * The CityEngine renders the quantum city and animates it from
 * WorldActivity snapshots. It never mutates domain or trace state — it only
 * reads activity and reports picks. Lighting presets, cameras, and quality
 * settings change presentation only (W2.6).
 */

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly quality: 'high' | 'balanced' | 'low';
  readonly timeOfDay: TimeOfDay;
  readonly reducedMotion: boolean;
  readonly particles: boolean;
  readonly labels: boolean;
  readonly onPick: (target: PickTarget) => void;
  readonly onContextLost: () => void;
}

export interface DeviceView {
  readonly positions: readonly (readonly [number, number])[];
  readonly edges: readonly (readonly [number, number])[];
}

export class CityEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly rig: CameraRig;
  private readonly city: CityMeshes;
  private readonly sky: SkyRig;
  private qpu: QpuMeshes | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly canvas: HTMLCanvasElement;
  private readonly onPick: (target: PickTarget) => void;
  private animationHandle = 0;
  private lastTime = 0;
  private activity: WorldActivity | null = null;
  private timeOfDay: TimeOfDay;
  private reducedMotion: boolean;
  private particles: boolean;
  private labelsEnabled: boolean;
  private noisyConfigured = false;
  private readonly labelSprites: THREE.Sprite[] = [];
  private readonly jobToken: THREE.Mesh;
  private jobTokenTarget = new THREE.Vector3(-330, 10, 40);
  private readonly rain: THREE.Points;
  private readonly rainBasePositions: Float32Array;
  private readonly pulses: { mesh: THREE.Mesh; born: number }[] = [];
  private pmrem: THREE.PMREMGenerator | null = null;
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private farPropsVisible = true;
  private disposed = false;
  /** Set when the user is near an interactive console in first-person mode. */
  nearbyInteractiveId: string | null = null;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.onPick = options.onPick;
    this.timeOfDay = options.timeOfDay;
    this.reducedMotion = options.reducedMotion;
    this.particles = options.particles;
    this.labelsEnabled = options.labels;

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: options.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();

    this.sky = buildSky();
    this.scene.add(this.sky.group);
    // Shadow frustum sized to the visible neighborhood; it follows the
    // camera target each frame.
    const shadow = this.sky.sun.shadow;
    shadow.camera.left = -420;
    shadow.camera.right = 420;
    shadow.camera.top = 420;
    shadow.camera.bottom = -420;
    shadow.camera.near = 50;
    shadow.camera.far = 2000;
    shadow.bias = -0.0004;
    shadow.normalBias = 0.5;
    shadow.camera.updateProjectionMatrix();

    this.city = buildCity();
    this.scene.add(this.city.group);

    // The job token: the program traveling through the pipeline. It is a
    // job/instruction marker, never a quantum state.
    this.jobToken = new THREE.Mesh(
      new THREE.OctahedronGeometry(3.2),
      new THREE.MeshStandardMaterial({
        color: '#ffffff',
        emissive: '#66ccff',
        emissiveIntensity: 1.2,
        roughness: 0.3,
      }),
    );
    this.jobToken.position.copy(this.jobTokenTarget);
    this.jobToken.name = 'job-token';
    this.scene.add(this.jobToken);

    // Rain over the QPU Grid, driven by noise weather. Deterministic
    // hash-based positions: stable screenshots (W1.10).
    const rainCount = 900;
    const rainGeometry = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    const qpuDistrict = getDistrict('qpu-grid');
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] =
        qpuDistrict.bounds.x + (hash01(`rain:${i}:x`) - 0.5) * qpuDistrict.bounds.width * 1.2;
      rainPositions[i * 3 + 1] = 14 + hash01(`rain:${i}:y`) * 60;
      rainPositions[i * 3 + 2] =
        qpuDistrict.bounds.z + (hash01(`rain:${i}:z`) - 0.5) * qpuDistrict.bounds.depth * 1.2;
    }
    this.rainBasePositions = rainPositions.slice();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rain = new THREE.Points(
      rainGeometry,
      new THREE.PointsMaterial({
        color: '#9db8d8',
        size: 1.1,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.rain.name = 'noise-rain';
    this.scene.add(this.rain);

    this.rig = new CameraRig(
      options.canvas.clientWidth / options.canvas.clientHeight,
      this.city.buildings,
    );
    this.rig.reducedMotion = options.reducedMotion;

    this.buildLabels();
    this.setQuality(options.quality);
    this.setTimeOfDay(options.timeOfDay);
    this.bindInput();
    options.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      options.onContextLost();
    });

    this.lastTime = performance.now();
    const loop = (): void => {
      if (this.disposed) return;
      this.animationHandle = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.tick(dt, now);
      this.renderer.render(this.scene, this.rig.camera);
    };
    loop();
  }

  private buildLabels(): void {
    for (const d of DISTRICTS) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext('2d')!;
      ctx.font = '600 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 8;
      ctx.strokeText(d.name, 256, 60);
      ctx.fillText(d.name, 256, 60);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          transparent: true,
          depthTest: false,
        }),
      );
      // Labels float above the tallest structure in each district.
      const tallest = this.city.buildings
        .filter((b) => b.districtId === d.id)
        .reduce((max, b) => Math.max(max, b.collisionHeight), 20);
      sprite.position.set(d.bounds.x, tallest + 26, d.bounds.z);
      sprite.scale.set(64, 12, 1);
      sprite.visible = this.labelsEnabled;
      this.scene.add(sprite);
      this.labelSprites.push(sprite);
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.downAt = { x: e.clientX, y: e.clientY };
      this.rig.onPointerDown(e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', (e) => this.rig.onPointerMove(e.clientX, e.clientY));
    c.addEventListener('pointerup', (e) => {
      this.rig.onPointerUp();
      this.pick(e);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.rig.onWheel(e.deltaY);
      },
      { passive: false },
    );
    c.addEventListener(
      'touchstart',
      (e) => {
        this.rig.onTouchStart([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
      },
      { passive: true },
    );
    c.addEventListener(
      'touchmove',
      (e) => {
        this.rig.onTouchMove([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
      },
      { passive: true },
    );
    c.addEventListener('touchend', () => this.rig.onTouchEnd(), {
      passive: true,
    });
  }

  private downAt: { x: number; y: number } | null = null;

  private pick(e: PointerEvent): void {
    // Suppress picks after drags.
    if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) {
      this.downAt = null;
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const candidates: THREE.Object3D[] = [
      ...(this.qpu ? this.qpu.pylons : []),
      ...this.city.interactiveMeshes.values(),
      ...this.city.rangedPicks.keys(),
      ...this.city.objectPicks.keys(),
    ];
    const hits = this.raycaster.intersectObjects(candidates, true);
    const hit = hits[0];
    if (!hit) return;
    // Interactive kiosks include child screens; walk up to the named node.
    let object: THREE.Object3D | null = hit.object;
    while (
      object &&
      !object.name.startsWith('qubit-') &&
      !this.city.objectPicks.has(object) &&
      !this.city.rangedPicks.has(object)
    ) {
      object = object.parent;
    }
    if (!object) return;
    if (object.name.startsWith('qubit-')) {
      this.onPick({ kind: 'qubit', qubit: Number(object.name.slice(6)) });
      return;
    }
    const direct = this.city.objectPicks.get(object);
    if (direct) {
      this.onPick(direct);
      return;
    }
    const ranges = this.city.rangedPicks.get(object);
    if (ranges && hit.faceIndex !== undefined && hit.faceIndex !== null) {
      const indexOffset = hit.faceIndex * 3;
      for (const range of ranges) {
        if (indexOffset >= range.start && indexOffset < range.start + range.count) {
          this.onPick(range.target);
          return;
        }
      }
    }
  }

  private tick(dt: number, now: number): void {
    this.rig.update(dt);
    this.sky.update(dt, this.reducedMotion);

    // Shadow frustum follows the viewed neighborhood along the preset's
    // fixed sun direction.
    const target =
      this.rig.mode === 'orbit' || this.rig.mode === 'top'
        ? this.rig.orbitTarget
        : this.rig.position;
    this.sky.sun.position.copy(target).addScaledVector(this.sunDir, 900);
    this.sky.sun.target.position.copy(target);
    this.sky.sun.target.updateMatrixWorld();

    // Move the job token toward the most downstream active district.
    if (this.activity && this.activity.eventsAtTick.length > 0) {
      const latest = this.activity.eventsAtTick[this.activity.eventsAtTick.length - 1]!;
      const district = districtForStage(latest.stage);
      this.jobTokenTarget.set(
        district.bounds.x,
        terrainHeight(district.bounds.x, district.bounds.z) + 9,
        district.bounds.z - district.bounds.depth / 2 - 8,
      );
    }
    if (this.reducedMotion) {
      this.jobToken.position.copy(this.jobTokenTarget);
    } else {
      this.jobToken.position.lerp(this.jobTokenTarget, Math.min(1, dt * 3));
      this.jobToken.rotation.y += dt * 1.5;
    }

    // Rain falls while visible.
    const rainMaterial = this.rain.material as THREE.PointsMaterial;
    if (rainMaterial.opacity > 0.01 && !this.reducedMotion) {
      const positions = this.rain.geometry.getAttribute('position');
      const array = positions.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        array[i + 1]! -= dt * 46;
        if (array[i + 1]! < 4) array[i + 1] = this.rainBasePositions[i + 1]!;
      }
      positions.needsUpdate = true;
    }

    // Expire district pulses.
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i]!;
      const age = (now - pulse.born) / 1000;
      if (age > 1.2) {
        this.scene.remove(pulse.mesh);
        (pulse.mesh.material as THREE.Material).dispose();
        pulse.mesh.geometry.dispose();
        this.pulses.splice(i, 1);
      } else {
        const s = 1 + age * (this.reducedMotion ? 0 : 20);
        pulse.mesh.scale.set(s, 1, s);
        (pulse.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - age * 0.45);
      }
    }

    // Practical far LOD: hide curb-level props at long range.
    const viewDistance = this.rig.camera.position.distanceTo(target) + this.rig.camera.position.y;
    const shouldShow = viewDistance < 620;
    if (shouldShow !== this.farPropsVisible) {
      this.farPropsVisible = shouldShow;
      for (const mesh of this.city.farHidden) mesh.visible = shouldShow;
    }

    // First-person proximity to interactive consoles.
    if (this.rig.mode === 'first-person') {
      const p = this.rig.position;
      let nearest: string | null = null;
      let nearestDist = 8;
      for (const interactive of INTERACTIVES) {
        const d = Math.hypot(p.x - interactive.position[0], p.z - interactive.position[1]);
        if (d < nearestDist) {
          nearest = interactive.id;
          nearestDist = d;
        }
      }
      this.nearbyInteractiveId = nearest;
    } else {
      this.nearbyInteractiveId = null;
    }
  }

  /** Applies a new activity snapshot (called when the playback tick changes). */
  setActivity(activity: WorldActivity | null, noisyConfigured: boolean): void {
    this.activity = activity;
    this.noisyConfigured = noisyConfigured;
    // Reset district strip glow to its ambient level.
    const ambient = this.timeOfDay === 'night' ? 0.3 : 0.1;
    for (const strip of this.city.districtStrips.values()) {
      (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = ambient;
    }
    if (!activity) {
      (this.rain.material as THREE.PointsMaterial).opacity = 0;
      this.sky.setCloudCover(0);
      return;
    }
    for (const da of activity.districts) {
      const strip = this.city.districtStrips.get(da.districtId);
      if (strip) {
        (strip.material as THREE.MeshStandardMaterial).emissiveIntensity = ambient + 0.75;
        if (this.particles && !this.reducedMotion && this.pulses.length < 24) {
          const district = getDistrict(da.districtId);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(4, 5.8, 32),
            new THREE.MeshBasicMaterial({
              color: district.accentColor,
              transparent: true,
              opacity: 0.5,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(
            district.bounds.x,
            terrainHeight(district.bounds.x, district.bounds.z) + 0.6,
            district.bounds.z,
          );
          this.scene.add(ring);
          this.pulses.push({ mesh: ring, born: performance.now() });
        }
      }
    }
    // QPU highlights.
    if (this.qpu) {
      this.qpu.pylons.forEach((pylon, i) => {
        const material = pylon.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = activity.activeQubits.includes(i) ? 1.6 : 0.18;
      });
      for (const [key, bridge] of this.qpu.bridges) {
        const material = bridge.material as THREE.MeshStandardMaterial;
        const [a, b] = key.split('-').map(Number);
        const active = activity.activeCouplings.some(
          ([x, y]) => (x === a && y === b) || (x === b && y === a),
        );
        material.emissiveIntensity = active ? 1.8 : 0.12;
      }
    }
    // Noise weather: rain and cloud cover over the QPU Grid.
    const noiseNow = activity.eventsAtTick.some((e) => e.eventType === 'noise.applied');
    const rainMaterial = this.rain.material as THREE.PointsMaterial;
    rainMaterial.opacity =
      this.particles && (noiseNow || noisyConfigured) ? (noiseNow ? 0.85 : 0.28) : 0;
    this.sky.setCloudCover(noisyConfigured ? (noiseNow ? 1 : 0.5) : 0);
  }

  setDevice(view: DeviceView | null): void {
    if (this.qpu) {
      this.scene.remove(this.qpu.group);
      this.qpu.dispose();
      this.qpu = null;
    }
    if (view) {
      const world = qpuPylonPositions(view.positions);
      this.qpu = buildQpu(view.positions, view.edges, getDistrict('qpu-grid').accentColor, world);
      this.scene.add(this.qpu.group);
    }
  }

  setCameraMode(mode: CameraMode): void {
    this.rig.setMode(mode);
  }

  get cameraMode(): CameraMode {
    return this.rig.mode;
  }

  /** Touch joystick input for walk and fly modes. */
  setMoveAxis(forward: number, strafe: number, lift = 0): void {
    this.rig.moveAxis.forward = forward;
    this.rig.moveAxis.strafe = strafe;
    this.rig.moveAxis.lift = lift;
  }

  flyToDistrict(districtId: string): void {
    const district = DISTRICTS.find((d) => d.id === districtId);
    if (district) {
      this.rig.flyTo(
        district.bounds.x,
        district.bounds.z,
        Math.max(district.bounds.width, district.bounds.depth) * 1.6,
      );
    }
  }

  onKeyDown(code: string): void {
    this.rig.onKeyDown(code);
  }

  onKeyUp(code: string): void {
    this.rig.onKeyUp(code);
  }

  setTimeOfDay(time: TimeOfDay): void {
    this.timeOfDay = time;
    const preset = this.sky.applyPreset(time);
    this.sunDir.copy(sunDirection(preset));
    this.city.applyTimeOfDay(time);
    this.scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);
    this.renderer.toneMappingExposure = preset.exposure;
    this.refreshEnvironment();
    // Re-apply activity-dependent glow at the new ambient level.
    this.setActivity(this.activity, this.noisyConfigured);
  }

  /** Environment map from the sky dome: water and glass reflect the sky. */
  private refreshEnvironment(): void {
    try {
      this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
      const skyScene = new THREE.Scene();
      const dome = this.sky.group.getObjectByName('sky-dome');
      if (!dome) return;
      const clone = dome.clone();
      skyScene.add(clone);
      const previous = this.envTarget;
      this.envTarget = this.pmrem.fromScene(skyScene, 0.04);
      this.scene.environment = this.envTarget.texture;
      this.scene.environmentIntensity =
        this.timeOfDay === 'night' ? 0.35 : this.timeOfDay === 'golden' ? 0.45 : 0.5;
      previous?.dispose();
    } catch {
      // Environment maps are an enhancement; rendering continues without
      // them if the context cannot build one (e.g. headless tests).
    }
  }

  setQuality(quality: 'high' | 'balanced' | 'low'): void {
    const ratio =
      quality === 'high'
        ? Math.min(2, globalThis.devicePixelRatio || 1)
        : quality === 'balanced'
          ? Math.min(1.5, globalThis.devicePixelRatio || 1)
          : 1;
    this.renderer.setPixelRatio(ratio);
    const shadows = quality !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.sky.sun.castShadow = shadows;
    const size = quality === 'high' ? 2048 : 1536;
    this.sky.sun.shadow.mapSize.set(size, size);
    this.sky.sun.shadow.map?.dispose();
    this.sky.sun.shadow.map = null;
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.rig.reducedMotion = reduced;
  }

  setParticles(enabled: boolean): void {
    this.particles = enabled;
  }

  setLabels(enabled: boolean): void {
    this.labelsEnabled = enabled;
    for (const sprite of this.labelSprites) sprite.visible = enabled;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.rig.camera.aspect = width / height;
    this.rig.camera.updateProjectionMatrix();
  }

  renderStats(): { drawCalls: number; triangles: number } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationHandle);
    this.city.dispose();
    this.sky.dispose();
    this.qpu?.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.jobToken.geometry.dispose();
    (this.jobToken.material as THREE.Material).dispose();
    for (const sprite of this.labelSprites) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    this.renderer.dispose();
  }
}

export type { PickTarget } from './city-builder.js';
export type { CameraMode } from './cameras.js';
export type { TimeOfDay } from './sky.js';
