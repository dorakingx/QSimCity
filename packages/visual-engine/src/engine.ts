import * as THREE from 'three';
import {
  DISTRICTS,
  districtForStage,
  getDistrict,
  INTERACTIVES,
  type WorldActivity,
} from '@qsimcity/world';
import { buildCity, buildQpu, type CityMeshes, type PickTarget, type QpuMeshes } from './instanced-city.js';
import { CameraRig, type CameraMode } from './cameras.js';

/**
 * The CityEngine renders the quantum city and animates it from
 * WorldActivity snapshots. It never mutates domain or trace state — it only
 * reads activity and reports picks (spec §13 boundaries).
 */

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly quality: 'high' | 'balanced' | 'low';
  readonly night: boolean;
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
  private qpu: QpuMeshes | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly canvas: HTMLCanvasElement;
  private readonly onPick: (target: PickTarget) => void;
  private animationHandle = 0;
  private lastTime = 0;
  private activity: WorldActivity | null = null;
  private night: boolean;
  private reducedMotion: boolean;
  private particles: boolean;
  private labelsEnabled: boolean;
  private readonly labelSprites: THREE.Sprite[] = [];
  private readonly jobToken: THREE.Mesh;
  private jobTokenTarget = new THREE.Vector3(-190, 6, 20);
  private readonly weather: THREE.Points;
  private readonly ambient: THREE.AmbientLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly grid: THREE.GridHelper;
  private readonly stars: THREE.Points;
  private readonly ground: THREE.Mesh;
  private readonly pulses: { mesh: THREE.Mesh; born: number }[] = [];
  private disposed = false;
  /** Set when the user is near an interactive console in first-person mode. */
  nearbyInteractiveId: string | null = null;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.onPick = options.onPick;
    this.night = options.night;
    this.reducedMotion = options.reducedMotion;
    this.particles = options.particles;
    this.labelsEnabled = options.labels;

    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: options.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.setQuality(options.quality);
    this.scene = new THREE.Scene();

    this.city = buildCity();
    this.scene.add(this.city.group);

    // Ground plus a faint survey grid so the terrain reads as a plane
    // rather than void, at both day and night.
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 1400),
      new THREE.MeshStandardMaterial({ color: '#11141b', roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.6;
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(1600, 64, 0x2a3350, 0x1c2438);
    this.grid.position.y = -0.5;
    this.scene.add(this.grid);

    // Starfield: visible at night, hidden by day.
    const starCount = 700;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Deterministic dome placement (no Math.random: stable screenshots).
      const a = (i * 2.399963) % (Math.PI * 2);
      const t = (i / starCount) * Math.PI * 0.45 + 0.06;
      const r = 900;
      starPositions[i * 3] = Math.cos(a) * Math.sin(t) * r;
      starPositions[i * 3 + 1] = Math.cos(t) * r * 0.8 + 120;
      starPositions[i * 3 + 2] = Math.sin(a) * Math.sin(t) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: '#c8d4ff', size: 2.4, sizeAttenuation: false }),
    );
    this.scene.add(this.stars);

    this.ambient = new THREE.AmbientLight('#8899bb', 0.5);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.0);
    this.sun.position.set(200, 300, -100);
    this.scene.add(this.ambient, this.sun);

    // The job token: the program traveling through the pipeline. It is a
    // job/instruction marker, never a quantum state (spec §10).
    this.jobToken = new THREE.Mesh(
      new THREE.OctahedronGeometry(3),
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

    // Noise weather particles over the QPU grid.
    const weatherCount = 400;
    const weatherGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(weatherCount * 3);
    const qpuDistrict = getDistrict('qpu-grid');
    for (let i = 0; i < weatherCount; i++) {
      positions[i * 3] = qpuDistrict.bounds.x + (Math.random() - 0.5) * qpuDistrict.bounds.width;
      positions[i * 3 + 1] = 20 + Math.random() * 25;
      positions[i * 3 + 2] = qpuDistrict.bounds.z + (Math.random() - 0.5) * qpuDistrict.bounds.depth;
    }
    weatherGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.weather = new THREE.Points(
      weatherGeo,
      new THREE.PointsMaterial({ color: '#b46ad8', size: 1.2, transparent: true, opacity: 0 }),
    );
    this.scene.add(this.weather);

    this.rig = new CameraRig(options.canvas.clientWidth / options.canvas.clientHeight, this.city.buildings);
    this.rig.reducedMotion = options.reducedMotion;

    this.buildLabels();
    this.setNight(options.night);
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
      // Labels float above the tallest structure in each district so they
      // never collide with the silhouette.
      sprite.position.set(d.bounds.x, d.id === 'scheduling-tower' ? 86 : 62, d.bounds.z);
      sprite.scale.set(58, 10.9, 1);
      sprite.visible = this.labelsEnabled;
      this.scene.add(sprite);
      this.labelSprites.push(sprite);
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.rig.onPointerDown(e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', (e) => this.rig.onPointerMove(e.clientX, e.clientY));
    c.addEventListener('pointerup', (e) => {
      this.rig.onPointerUp();
      // Treat short non-drag releases as picks.
      this.pick(e);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.rig.onWheel(e.deltaY);
    }, { passive: false });
    c.addEventListener('touchstart', (e) => {
      this.rig.onTouchStart([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
    }, { passive: true });
    c.addEventListener('touchmove', (e) => {
      this.rig.onTouchMove([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
    }, { passive: true });
    c.addEventListener('touchend', () => this.rig.onTouchEnd(), { passive: true });
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
      this.city.boxes,
      this.city.cylinders,
      this.city.spheres,
      ...this.city.districtPlates.values(),
    ];
    const hits = this.raycaster.intersectObjects(candidates, false);
    const hit = hits[0];
    if (!hit) return;
    if (hit.object.name.startsWith('qubit-')) {
      this.onPick({ kind: 'qubit', qubit: Number(hit.object.name.slice(6)) });
      return;
    }
    const targets = this.city.pickTargets.get(hit.object);
    if (!targets) return;
    if (hit.object instanceof THREE.InstancedMesh) {
      const target = targets[hit.instanceId ?? 0];
      if (target) this.onPick(target);
    } else {
      const target = targets[0];
      if (target) this.onPick(target);
    }
  }

  private tick(dt: number, now: number): void {
    this.rig.update(dt);

    // Move the job token toward the most downstream active district.
    if (this.activity && this.activity.eventsAtTick.length > 0) {
      const latest = this.activity.eventsAtTick[this.activity.eventsAtTick.length - 1]!;
      const district = districtForStage(latest.stage);
      this.jobTokenTarget.set(district.bounds.x, 6, district.bounds.z - district.bounds.depth / 2 - 6);
    }
    if (this.reducedMotion) {
      this.jobToken.position.copy(this.jobTokenTarget);
    } else {
      this.jobToken.position.lerp(this.jobTokenTarget, Math.min(1, dt * 3));
      this.jobToken.rotation.y += dt * 1.5;
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
        const s = 1 + age * (this.reducedMotion ? 0 : 14);
        pulse.mesh.scale.set(s, 1, s);
        (pulse.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 - age * 0.5);
      }
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
    // Reset district plate glow.
    for (const [id, plate] of this.city.districtPlates) {
      const material = plate.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.05;
      void id;
    }
    if (!activity) return;
    for (const da of activity.districts) {
      const plate = this.city.districtPlates.get(da.districtId);
      if (plate) {
        (plate.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
        if (this.particles && !this.reducedMotion && this.pulses.length < 24) {
          const district = getDistrict(da.districtId);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(3, 4.4, 32),
            new THREE.MeshBasicMaterial({
              color: district.accentColor,
              transparent: true,
              opacity: 0.55,
              side: THREE.DoubleSide,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(district.bounds.x, 0.4, district.bounds.z);
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
    // Noise weather visibility.
    const noiseNow = activity.eventsAtTick.some((e) => e.eventType === 'noise.applied');
    const weatherMaterial = this.weather.material as THREE.PointsMaterial;
    weatherMaterial.opacity = this.particles && (noiseNow || noisyConfigured) ? (noiseNow ? 0.85 : 0.3) : 0;
  }

  setDevice(view: DeviceView | null): void {
    if (this.qpu) {
      this.scene.remove(this.qpu.group);
      this.qpu.dispose();
      this.qpu = null;
    }
    if (view) {
      this.qpu = buildQpu(view.positions, view.edges, getDistrict('qpu-grid').accentColor);
      this.scene.add(this.qpu.group);
    }
  }

  setCameraMode(mode: CameraMode): void {
    this.rig.setMode(mode);
  }

  get cameraMode(): CameraMode {
    return this.rig.mode;
  }

  flyToDistrict(districtId: string): void {
    const district = DISTRICTS.find((d) => d.id === districtId);
    if (district) this.rig.flyTo(district.bounds.x, district.bounds.z, 110);
  }

  onKeyDown(code: string): void {
    this.rig.onKeyDown(code);
  }

  onKeyUp(code: string): void {
    this.rig.onKeyUp(code);
  }

  setNight(night: boolean): void {
    this.night = night;
    this.city.setNight(night);
    this.scene.background = new THREE.Color(night ? '#070a12' : '#9dc0e4');
    this.scene.fog = new THREE.Fog(night ? '#070a12' : '#9dc0e4', 520, 1400);
    this.ambient.intensity = night ? 0.58 : 0.8;
    this.ambient.color.set(night ? '#6677bb' : '#ccddee');
    this.sun.intensity = night ? 0.45 : 1.15;
    this.sun.color.set(night ? '#8899ff' : '#fff6e0');
    this.stars.visible = night;
    // The ground plane covers most of the frame at the default camera
    // angle, so it — not the sky color — determines the overall tone.
    (this.ground.material as THREE.MeshStandardMaterial).color.set(night ? '#11141b' : '#5f6f56');
    (this.grid.material as THREE.Material).opacity = night ? 0.5 : 0.3;
    (this.grid.material as THREE.Material).transparent = true;
  }

  setQuality(quality: 'high' | 'balanced' | 'low'): void {
    const ratio =
      quality === 'high'
        ? Math.min(2, globalThis.devicePixelRatio || 1)
        : quality === 'balanced'
          ? Math.min(1.5, globalThis.devicePixelRatio || 1)
          : 1;
    this.renderer.setPixelRatio(ratio);
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
    this.qpu?.dispose();
    this.renderer.dispose();
  }
}

export type { PickTarget } from './instanced-city.js';
export type { CameraMode } from './cameras.js';
