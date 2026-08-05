import * as THREE from 'three';
import type { Trace } from 'qsimcity-trace';
import {
  activityAtTick,
  ambientVehiclesAt,
  convoyAt,
  countsAtTick,
  couriersAt,
  DISTRICTS,
  doorPosition,
  INTERIORS,
  getDistrict,
  INTERACTIVES,
  LANDMARK_SITES,
  pedestriansAt,
  physicalToLogicalAt,
  qpuPylonPositions,
  terrainHeight,
  hash01,
  WATER_LEVEL,
  weatherAt,
  WEST_COAST_X,
  type WorldActivity,
} from '@qsimcity/world';
import {
  accentBaseIntensity,
  buildCity,
  buildQpu,
  type CityMeshes,
  type PickTarget,
  type QpuMeshes,
} from './city-builder.js';
import { buildSky, sunDirection, type SkyRig, type TimeOfDay } from './sky.js';
import { buildVehicles, type VehicleFleet } from './vehicles.js';
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
  private trace: Trace | null = null;
  private playbackTick = 0;
  private animTime = 0;
  private readonly labelSprites: THREE.Sprite[] = [];
  private readonly interiorSigns: THREE.Sprite[] = [];
  private readonly vehicles: VehicleFleet;
  /** Logical-qubit banners keyed by logical index; they fly between pylons
   * when SWAPs exchange the mapping (W4.2, W4.3). */
  private readonly logicalBanners = new Map<number, THREE.Sprite>();
  private readonly bannerTargets = new Map<number, THREE.Vector3>();
  private pylonWorld: readonly (readonly [number, number])[] = [];
  /** Instanced containers stacking the live counts histogram (W4.4). */
  private countStacks: THREE.InstancedMesh | null = null;
  /** Stage-specific set pieces (spec section 5.1): the arriving ship, the
   * refinery steam, the scheduling beacon, and the observatory beam. */
  private arrivalShip: THREE.Group | null = null;
  private arrivalProgress = 0;
  private arrivalTarget = 0;
  private steam: THREE.Points | null = null;
  private steamActive = false;
  private beacon: THREE.Mesh | null = null;
  private beaconActive = false;
  private resultBeam: THREE.Mesh | null = null;
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

    // Vehicles: the job convoy, classical couriers, ambient traffic, and
    // pedestrians. States come from pure world derivations.
    this.vehicles = buildVehicles();
    this.scene.add(this.vehicles.group);

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
    options.canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        if (!this.disposed) options.onContextLost();
      },
      { signal: this.inputAbort.signal },
    );

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

  /** Text sprite canvas: bold stroked text over a soft dark backing plate
   * so labels survive bright rooftops and busy skylines. */
  private makeTextSprite(text: string, depthTest: boolean): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 104;
    const ctx = canvas.getContext('2d')!;
    // Fit long names: shrink the font until the text fits, and pass an
    // explicit maxWidth when drawing — measureText under-reports the width
    // of stroked bold glyphs, which clipped the last letter of long names.
    let fontSize = 46;
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    while (fontSize > 24 && ctx.measureText(text).width > 416) {
      fontSize -= 2;
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    }
    ctx.textAlign = 'center';
    const measured = Math.min(416, ctx.measureText(text).width);
    const width = Math.min(500, measured + 64);
    ctx.fillStyle = 'rgba(10, 14, 22, 0.62)';
    ctx.beginPath();
    ctx.roundRect(256 - width / 2, 14, width, 76, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 8;
    ctx.strokeText(text, 256, 66, measured);
    ctx.fillText(text, 256, 66, measured);
    return new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthTest,
      }),
    );
  }

  private buildLabels(): void {
    for (const d of DISTRICTS) {
      const sprite = this.makeTextSprite(d.name, false);
      // Labels float above the tallest structure in each district.
      const tallest = this.city.buildings
        .filter((b) => b.districtId === d.id)
        .reduce((max, b) => Math.max(max, b.collisionHeight), 20);
      sprite.position.set(d.bounds.x, tallest + 26, d.bounds.z);
      sprite.scale.set(58, 11.8, 1);
      sprite.visible = this.labelsEnabled;
      this.scene.add(sprite);
      this.labelSprites.push(sprite);
    }
    // Room name boards inside enterable interiors: placed toward the wall
    // opposite the door so a visitor reads them on entry. Depth-tested so
    // they never bleed through walls, and independent of the label toggle
    // because they are signage, not overlay.
    for (const room of INTERIORS) {
      const sign = this.makeTextSprite(room.name, true);
      const door = doorPosition(room);
      const [cx, cz] = room.center;
      sign.position.set(
        cx + (cx - door.x) * 0.82,
        terrainHeight(cx, cz) + room.height - 2.6,
        cz + (cz - door.z) * 0.82,
      );
      sign.scale.set(9, 1.83, 1);
      this.scene.add(sign);
      this.interiorSigns.push(sign);
    }
  }

  /**
   * All canvas listeners are registered under this abort signal and removed
   * in dispose(). Without this, a detached canvas (kept registered by the
   * browser while its WebGL context is alive) retains the whole engine
   * through the listener closures — the city geometry never gets collected
   * and every 3D remount leaks the previous engine.
   */
  private readonly inputAbort = new AbortController();

  private bindInput(): void {
    const c = this.canvas;
    const signal = this.inputAbort.signal;
    c.addEventListener(
      'pointerdown',
      (e) => {
        c.setPointerCapture(e.pointerId);
        this.downAt = { x: e.clientX, y: e.clientY };
        this.rig.onPointerDown(e.clientX, e.clientY);
      },
      { signal },
    );
    c.addEventListener('pointermove', (e) => this.rig.onPointerMove(e.clientX, e.clientY), {
      signal,
    });
    c.addEventListener(
      'pointerup',
      (e) => {
        this.rig.onPointerUp();
        this.pick(e);
      },
      { signal },
    );
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.rig.onWheel(e.deltaY);
      },
      { passive: false, signal },
    );
    c.addEventListener(
      'touchstart',
      (e) => {
        this.rig.onTouchStart([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
      },
      { passive: true, signal },
    );
    c.addEventListener(
      'touchmove',
      (e) => {
        this.rig.onTouchMove([...e.touches].map((t) => ({ x: t.clientX, y: t.clientY })));
      },
      { passive: true, signal },
    );
    c.addEventListener('touchend', () => this.rig.onTouchEnd(), {
      passive: true,
      signal,
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

    // Vehicles: ambient traffic and pedestrians animate per frame; the
    // convoy chases its semantic target smoothly.
    this.animTime += dt;
    this.vehicles.update(
      dt,
      ambientVehiclesAt(this.animTime, this.reducedMotion),
      pedestriansAt(this.trace, this.playbackTick, this.animTime, this.reducedMotion),
      this.reducedMotion,
    );

    // The program ship sails from open water to the Program Port pier as
    // the run begins; scrubbing back sends it out again.
    if (this.arrivalShip) {
      const k = this.reducedMotion ? 1 : Math.min(1, dt * 1.6);
      this.arrivalProgress += (this.arrivalTarget - this.arrivalProgress) * k;
      const t = this.arrivalProgress;
      const dockX = WEST_COAST_X - 14;
      const dockZ = 2;
      const seaX = WEST_COAST_X - 170;
      const seaZ = -70;
      this.arrivalShip.position.set(
        seaX + (dockX - seaX) * t,
        WATER_LEVEL + 0.2,
        seaZ + (dockZ - seaZ) * t,
      );
      this.arrivalShip.rotation.y = Math.atan2(dockX - seaX, dockZ - seaZ);
    }

    // Refinery steam rises; the scheduling beacon sweeps.
    if (this.steam && this.steamActive && !this.reducedMotion) {
      const positions = this.steam.geometry.getAttribute('position');
      const array = positions.array as Float32Array;
      for (let i = 1; i < array.length; i += 3) {
        array[i] = array[i]! + dt * 7;
        if (array[i]! > 62) array[i] = 32;
      }
      positions.needsUpdate = true;
    }
    if (this.beacon && this.beaconActive && !this.reducedMotion) {
      this.beacon.rotation.y += dt * 1.7;
    }

    // Logical banners fly toward their current physical homes; a SWAP reads
    // as two banners crossing between pylons.
    for (const [logical, banner] of this.logicalBanners) {
      const bannerTarget = this.bannerTargets.get(logical);
      if (!bannerTarget || !banner.visible) continue;
      if (this.reducedMotion) banner.position.copy(bannerTarget);
      else banner.position.lerp(bannerTarget, Math.min(1, dt * 3.2));
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

    // District labels are skyline furniture: hidden at street level, where
    // architecture and consoles carry the meaning instead.
    const labelsVisible = this.labelsEnabled && this.rig.mode !== 'first-person';
    if (this.labelSprites[0] && this.labelSprites[0].visible !== labelsVisible) {
      for (const sprite of this.labelSprites) sprite.visible = labelsVisible;
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

  /**
   * The single playback entry point: the engine derives everything it shows
   * from (trace, tick) with the same pure world functions every other
   * surface uses.
   */
  setPlayback(trace: Trace | null, tick: number, noisyConfigured: boolean): void {
    this.trace = trace;
    this.playbackTick = tick;
    // One activity derivation per tick change, shared by every consumer
    // below (the set pieces used to recompute it).
    const activity = trace ? activityAtTick(trace, tick) : null;
    this.setActivity(activity, noisyConfigured);
    this.vehicles.setSemantic(convoyAt(trace, tick), trace ? couriersAt(trace, tick) : []);
    const weather = weatherAt(trace, tick);
    const rainMaterial = this.rain.material as THREE.PointsMaterial;
    // Rain is SAMPLED: visible only when noise.applied events fire at the
    // tick. Configured-but-unsampled noise shows as clouds (ESTIMATED), not
    // as a haze of the rain particle system.
    rainMaterial.opacity = this.particles ? weather.rain * 0.85 : 0;
    this.sky.setCloudCover(weather.cover);
    this.updateLogicalBanners();
    this.updateCountStacks();
    this.updateStageSetPieces(trace, tick, activity);
  }

  /**
   * Stage set pieces (spec section 5.1), all derived from the same events:
   * the program ship sails in and docks while intake/parse events fire,
   * the refinery vents steam during translation, the scheduling tower
   * sweeps its beacon, and the observatory raises a light beam when
   * results arrive. Presentation only; scrubbing reproduces each state.
   */
  private updateStageSetPieces(
    trace: Trace | null,
    tick: number,
    activity: WorldActivity | null,
  ): void {
    const stagesReached = new Set<string>();
    let latestStage = '';
    if (trace) {
      for (const event of trace.events) {
        if (event.logicalTick > tick) break;
        stagesReached.add(event.stage);
        latestStage = event.stage;
      }
    }
    // Program ship: offshore before the run, docked once parsing started.
    this.arrivalTarget = !trace
      ? 0
      : stagesReached.has('parse') || stagesReached.has('input')
        ? 1
        : 0;
    if (!this.arrivalShip) {
      const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x4e6b86, roughness: 0.6 });
      const castleMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e9ec, roughness: 0.5 });
      const crateMaterial = new THREE.MeshStandardMaterial({
        color: 0x224455,
        emissive: 0x66ccff,
        emissiveIntensity: 1.1,
        roughness: 0.35,
      });
      const ship = new THREE.Group();
      ship.name = 'program-ship';
      const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 26), hullMaterial);
      hull.position.y = 1.1;
      const castle = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 6), castleMaterial);
      castle.position.set(0, 4.4, -8);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 6), crateMaterial);
      crate.position.set(0, 3.2, 3);
      ship.add(hull, castle, crate);
      this.scene.add(ship);
      this.arrivalShip = ship;
    }

    // Refinery steam during translation ticks; beacon during scheduling.
    const eventsNow = activity?.eventsAtTick ?? [];
    this.steamActive = eventsNow.some((e) => e.stage === 'translation');
    if (!this.steam) {
      const site = LANDMARK_SITES['translation-refinery'];
      const count = 60;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = site.anchor[0] - 8 + (hash01(`steam:${i}:x`) - 0.5) * 6;
        positions[i * 3 + 1] = 32 + hash01(`steam:${i}:y`) * 26;
        positions[i * 3 + 2] = site.anchor[1] + (hash01(`steam:${i}:z`) - 0.5) * 6;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.steam = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0xe6ecf2,
          size: 3.2,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      this.steam.name = 'refinery-steam';
      this.scene.add(this.steam);
    }
    (this.steam.material as THREE.PointsMaterial).opacity =
      this.steamActive && this.particles ? 0.55 : 0;

    // Scheduling beacon sweep while scheduling events fire.
    this.beaconActive = eventsNow.some((e) => e.stage === 'scheduling');
    if (!this.beacon) {
      const site = LANDMARK_SITES['scheduling-tower'];
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(52, 0.5, 1.2),
        new THREE.MeshStandardMaterial({
          color: 0x33330a,
          emissive: 0xd8c93a,
          emissiveIntensity: 1.6,
          transparent: true,
          opacity: 0,
        }),
      );
      beam.position.set(
        site.anchor[0],
        terrainHeight(site.anchor[0], site.anchor[1]) + 79,
        site.anchor[1],
      );
      beam.name = 'scheduling-beacon';
      this.scene.add(beam);
      this.beacon = beam;
    }
    (this.beacon.material as THREE.MeshStandardMaterial).opacity = this.beaconActive ? 0.85 : 0;

    // Observatory beam once results exist.
    const resultsReached = stagesReached.has('result');
    if (!this.resultBeam) {
      const site = LANDMARK_SITES.observatory;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 2.6, 160, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xa8f06a,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beam.position.set(
        site.anchor[0],
        terrainHeight(site.anchor[0], site.anchor[1]) + 95,
        site.anchor[1],
      );
      beam.name = 'observatory-beam';
      this.scene.add(beam);
      this.resultBeam = beam;
    }
    (this.resultBeam.material as THREE.MeshBasicMaterial).opacity = resultsReached ? 0.28 : 0;
    void latestStage;
  }

  /**
   * Logical-qubit banners over the physical pylons. Each logical qubit
   * keeps one persistent banner (its identity); when a SWAP exchanges the
   * mapping, the two banners visibly fly to their new physical homes at the
   * same tick the inspector reports the exchange (W4.2, W4.3).
   */
  private updateLogicalBanners(): void {
    if (!this.trace || this.pylonWorld.length === 0) {
      for (const banner of this.logicalBanners.values()) banner.visible = false;
      return;
    }
    const mapping = physicalToLogicalAt(this.trace, this.playbackTick);
    const seen = new Set<number>();
    for (const [physical, logical] of mapping) {
      const world = this.pylonWorld[physical];
      if (world === undefined) continue;
      seen.add(logical);
      let banner = this.logicalBanners.get(logical);
      if (!banner) {
        banner = this.makeLogicalBanner(logical);
        this.logicalBanners.set(logical, banner);
        this.scene.add(banner);
      }
      const y = terrainHeight(world[0], world[1]) + 13.5;
      const target = this.bannerTargets.get(logical) ?? new THREE.Vector3();
      const firstPlacement = !this.bannerTargets.has(logical);
      target.set(world[0], y, world[1]);
      this.bannerTargets.set(logical, target);
      if (firstPlacement || this.reducedMotion) banner.position.copy(target);
      banner.visible = true;
    }
    for (const [logical, banner] of this.logicalBanners) {
      if (!seen.has(logical)) banner.visible = false;
    }
  }

  /** Distinct persistent color per logical qubit. */
  private makeLogicalBanner(logical: number): THREE.Sprite {
    const hue = (logical * 137.508) % 360;
    const color = new THREE.Color().setHSL(hue / 360, 0.72, 0.62);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `#${color.getHexString()}`;
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.lineTo(118, 8);
    ctx.lineTo(118, 54);
    ctx.lineTo(64, 72);
    ctx.lineTo(10, 54);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#10141c';
    ctx.font = '700 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`q${logical}`, 64, 48);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }),
    );
    sprite.scale.set(6.4, 4, 1);
    sprite.name = `logical-banner-${logical}`;
    return sprite;
  }

  /**
   * The Measurement Harbor results dock: one container per representative
   * measured record, stacked by bitstring — the live counts histogram
   * derived from the same events every panel shows (W4.4).
   */
  private updateCountStacks(): void {
    if (!this.countStacks) {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.2 });
      this.countStacks = new THREE.InstancedMesh(
        new THREE.BoxGeometry(5.6, 2.5, 2.4),
        material,
        160,
      );
      this.countStacks.name = 'count-stacks';
      this.countStacks.count = 0;
      this.countStacks.castShadow = true;
      this.scene.add(this.countStacks);
    }
    const stacks = this.countStacks;
    if (!this.trace) {
      stacks.count = 0;
      return;
    }
    const counts = countsAtTick(this.trace, this.playbackTick);
    const keys = [...counts.keys()].sort();
    const site = LANDMARK_SITES['measurement-harbor'];
    const baseX = site.anchor[0] + site.clearHalfW + 8;
    const baseZ = site.anchor[1] - 6;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let index = 0;
    keys.forEach((key, column) => {
      const total = Math.min(counts.get(key) ?? 0, 12);
      // Complete bitstrings get a solid hue per column; partial records
      // (still being measured) read as neutral steel.
      const partial = key.includes('?');
      for (let level = 0; level < total && index < 160; level++) {
        const x = baseX + column * 7.2;
        const z = baseZ + (level % 2 === 0 ? 0 : 0.4);
        const y = terrainHeight(x, baseZ) + 1.4 + level * 2.6;
        matrix.makeRotationY(0);
        matrix.setPosition(x, y, z);
        stacks.setMatrixAt(index, matrix);
        if (partial) color.set(0x9aa1a8);
        else color.setHSL(((column * 67) % 360) / 360, 0.55, 0.5);
        stacks.setColorAt(index, color);
        index++;
      }
    });
    stacks.count = index;
    stacks.instanceMatrix.needsUpdate = true;
    if (stacks.instanceColor) stacks.instanceColor.needsUpdate = true;
  }

  /** Applies a new activity snapshot (called when the playback tick changes). */
  setActivity(activity: WorldActivity | null, noisyConfigured: boolean): void {
    this.activity = activity;
    this.noisyConfigured = noisyConfigured;
    // Reset district accent glow to its ambient level.
    const ambient = accentBaseIntensity(this.timeOfDay);
    for (const accent of this.city.districtAccents.values()) {
      (accent.material as THREE.MeshStandardMaterial).emissiveIntensity = ambient;
    }
    if (!activity) {
      (this.rain.material as THREE.PointsMaterial).opacity = 0;
      this.sky.setCloudCover(0);
      return;
    }
    for (const da of activity.districts) {
      const accentMesh = this.city.districtAccents.get(da.districtId);
      if (accentMesh) {
        // Documented semantics (legend: district accent glow): the accent
        // brightens while the district's stage fires. The boost stays well
        // above ambient but below full-bright so lit accents keep reading
        // as signage rather than as unlit materials.
        (accentMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = ambient + 0.85;
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
  }

  setDevice(view: DeviceView | null): void {
    if (this.qpu) {
      this.scene.remove(this.qpu.group);
      this.qpu.dispose();
      this.qpu = null;
    }
    if (view) {
      const world = qpuPylonPositions(view.positions);
      this.pylonWorld = world;
      this.qpu = buildQpu(view.positions, view.edges, getDistrict('qpu-grid').accentColor, world);
      this.scene.add(this.qpu.group);
    } else {
      this.pylonWorld = [];
    }
    this.updateLogicalBanners();
  }

  setCameraMode(mode: CameraMode): void {
    this.rig.setMode(mode);
  }

  get cameraMode(): CameraMode {
    return this.rig.mode;
  }

  /** Stand the walker at an exact spot (camera-only; see CameraRig.walkTo). */
  walkTo(x: number, z: number, yaw: number): void {
    this.rig.walkTo(x, z, yaw);
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
    this.vehicles.applyTimeOfDay(time);
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
        this.timeOfDay === 'night' ? 0.35 : this.timeOfDay === 'golden' ? 0.55 : 0.7;
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
    // Break the canvas → listener → engine retention edge, then release the
    // WebGL context so the browser's canvas registry lets the canvas go.
    this.inputAbort.abort();
    this.city.dispose();
    this.sky.dispose();
    this.qpu?.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.vehicles.dispose();
    if (this.arrivalShip) {
      for (const child of this.arrivalShip.children) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
    if (this.steam) {
      this.steam.geometry.dispose();
      (this.steam.material as THREE.Material).dispose();
    }
    if (this.beacon) {
      this.beacon.geometry.dispose();
      (this.beacon.material as THREE.Material).dispose();
    }
    if (this.resultBeam) {
      this.resultBeam.geometry.dispose();
      (this.resultBeam.material as THREE.Material).dispose();
    }
    for (const banner of this.logicalBanners.values()) {
      banner.material.map?.dispose();
      banner.material.dispose();
    }
    if (this.countStacks) {
      this.countStacks.geometry.dispose();
      (this.countStacks.material as THREE.Material).dispose();
      this.countStacks.dispose();
    }
    for (const sprite of [...this.labelSprites, ...this.interiorSigns]) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
    for (const pulse of this.pulses) {
      pulse.mesh.geometry.dispose();
      (pulse.mesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    // Deliberately NOT forceContextLoss(): React StrictMode remounts reuse
    // the same canvas, and a force-lost context cannot be recreated on it.
    // Aborting the input listeners above already breaks the retention edge
    // (canvas -> listener closure -> engine) that leaked disposed engines;
    // the browser reclaims the context itself once the canvas is dropped.
  }
}

export type { PickTarget } from './city-builder.js';
export type { CameraMode } from './cameras.js';
export type { TimeOfDay } from './sky.js';
