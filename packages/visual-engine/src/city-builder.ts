import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  cityPlan,
  DISTRICTS,
  EAST_COAST_X,
  doorPosition,
  getDistrict,
  INTERACTIVES,
  INTERIOR_BUILDING_IDS,
  INTERIORS,
  interiorCollisionBoxes,
  PLAIN_HEIGHT,
  QPU_CAMPUS,
  QPU_GATE,
  SEABED_HEIGHT,
  terrainHeight,
  WATER_LEVEL,
  WEST_COAST_X,
  CITY_BOUNDS,
  hash01,
  type Building,
  type BuildingPart,
  type FacadeStyle,
  type Prop,
  type RoadSegment,
} from '@qsimcity/world';
import { crosswalkTexture, facadeTextures, roadTexture } from './textures.js';
import type { TimeOfDay } from './sky.js';

/**
 * Static city construction (spec §2): terrain, water, quays, roads,
 * sidewalks, buildings with facade textures, and instanced street props.
 * Everything deterministic; everything merged or instanced so the whole
 * city renders in a bounded number of draw calls (spec §4.5).
 */

export interface PickTarget {
  readonly kind: 'building' | 'district' | 'qubit' | 'interactive';
  readonly buildingId?: string;
  readonly districtId?: string;
  readonly qubit?: number;
  readonly interactiveId?: string;
}

interface PickRange {
  readonly start: number;
  readonly count: number;
  readonly target: PickTarget;
}

export interface CityMeshes {
  readonly group: THREE.Group;
  /** Merged meshes with per-face-range pick targets. */
  readonly rangedPicks: Map<THREE.Object3D, readonly PickRange[]>;
  /** Simple whole-object pick targets. */
  readonly objectPicks: Map<THREE.Object3D, PickTarget>;
  readonly buildings: readonly Building[];
  readonly interactiveMeshes: Map<string, THREE.Mesh>;
  /** Accent architecture per district; its glow marks stage activity. */
  readonly districtAccents: Map<string, THREE.Mesh>;
  /** Small props hidden at far zoom (practical LOD tier). */
  readonly farHidden: readonly THREE.Object3D[];
  readonly waterMaterial: THREE.MeshStandardMaterial;
  applyTimeOfDay(time: TimeOfDay): void;
  dispose(): void;
}

const FLOOR_H = 3.1;
const BAY_W = 3.2;

/** Ambient glow level of district accent architecture per time of day. */
export function accentBaseIntensity(time: TimeOfDay): number {
  return time === 'night' ? 1.1 : time === 'golden' ? 0.45 : 0.12;
}

const NEUTRAL_BODY = new THREE.Color(0xb6bac2);
const ROOF_COLOR = new THREE.Color(0x686c73);
const PLINTH_COLOR = new THREE.Color(0x54575e);

/** Indexed 4-wall geometry with meter-true facade UVs, base at y=0. */
function wallGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const u = (len: number): number => len / BAY_W;
  const v = h / FLOOR_H;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const face = (
    corners: [number, number, number][],
    normal: [number, number, number],
    uMax: number,
  ): void => {
    const base = positions.length / 3;
    for (const [i, corner] of corners.entries()) {
      positions.push(...corner);
      normals.push(...normal);
      uvs.push(i === 0 || i === 3 ? 0 : uMax, i < 2 ? 0 : v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // South (+z), north (-z), east (+x), west (-x); wound outward.
  face(
    [
      [-hw, 0, hd],
      [hw, 0, hd],
      [hw, h, hd],
      [-hw, h, hd],
    ],
    [0, 0, 1],
    u(w),
  );
  face(
    [
      [hw, 0, -hd],
      [-hw, 0, -hd],
      [-hw, h, -hd],
      [hw, h, -hd],
    ],
    [0, 0, -1],
    u(w),
  );
  face(
    [
      [hw, 0, hd],
      [hw, 0, -hd],
      [hw, h, -hd],
      [hw, h, hd],
    ],
    [1, 0, 0],
    u(d),
  );
  face(
    [
      [-hw, 0, -hd],
      [-hw, 0, hd],
      [-hw, h, hd],
      [-hw, h, -hd],
    ],
    [-1, 0, 0],
    u(d),
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Flat top quad at height h. */
function topGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(w, d);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, h, 0);
  return geometry;
}

/** Triangular prism: ridge along x, width w, height h, depth d, base y=0. */
function wedgeGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const positions = [
    // Slope +z.
    -hw,
    0,
    hd,
    hw,
    0,
    hd,
    hw,
    h,
    0,
    -hw,
    h,
    0,
    // Slope -z.
    hw,
    0,
    -hd,
    -hw,
    0,
    -hd,
    -hw,
    h,
    0,
    hw,
    h,
    0,
    // End +x.
    hw,
    0,
    hd,
    hw,
    0,
    -hd,
    hw,
    h,
    0,
    // End -x.
    -hw,
    0,
    -hd,
    -hw,
    0,
    hd,
    -hw,
    h,
    0,
  ];
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // A uv attribute keeps the wedge mergeable with textured geometries.
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Fill (or create) a solid vertex-color attribute. */
function paint(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Accumulates geometries and pick ranges for one merged mesh. */
class Bucket {
  readonly geometries: THREE.BufferGeometry[] = [];
  readonly ranges: PickRange[] = [];
  private indexCount = 0;

  add(geometry: THREE.BufferGeometry, target?: PickTarget): void {
    if (!geometry.index) {
      throw new Error('Bucket requires indexed geometry');
    }
    if (target) {
      this.ranges.push({ start: this.indexCount, count: geometry.index.count, target });
    }
    this.indexCount += geometry.index.count;
    this.geometries.push(geometry);
  }

  build(material: THREE.Material, name: string): THREE.Mesh | null {
    if (this.geometries.length === 0) return null;
    const merged = mergeGeometries(this.geometries, false);
    for (const geometry of this.geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    return mesh;
  }
}

function transform(
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationY = 0,
): THREE.BufferGeometry {
  if (rotationY !== 0) geometry.rotateY(rotationY);
  geometry.translate(x, y, z);
  return geometry;
}

/** Terrain-following ground patch (parks, plazas, yards). */
function groundPatch(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  lift: number,
  color: THREE.Color,
): THREE.BufferGeometry {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const seg = Math.max(1, Math.min(6, Math.round(Math.max(w, d) / 14)));
  const geometry = new THREE.PlaneGeometry(w, d, seg, seg);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + (minX + maxX) / 2;
    const z = position.getZ(i) + (minZ + maxZ) / 2;
    position.setY(i, terrainHeight(x, z) + lift);
  }
  geometry.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  geometry.computeVertexNormals();
  return paint(geometry, color);
}

/** Road ribbon following the terrain along the segment centerline. */
function roadRibbon(
  segment: RoadSegment,
  offset: number,
  width: number,
  lift: number,
): THREE.BufferGeometry {
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  // Perpendicular (right of travel a->b).
  const px = uz;
  const pz = -ux;
  const steps = Math.max(1, Math.ceil(length / 12));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = segment.a.x + dx * t + px * offset;
    const cz = segment.a.z + dz * t + pz * offset;
    const h = terrainHeight(cx, cz) + lift;
    positions.push(cx - (px * width) / 2, h, cz - (pz * width) / 2);
    positions.push(cx + (px * width) / 2, h, cz + (pz * width) / 2);
    uvs.push((t * length) / 7, 0, (t * length) / 7, 1);
    if (i < steps) {
      // Wound so the surface normal points up (+y).
      const base = i * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface InstancedSpec {
  readonly mesh: THREE.InstancedMesh;
}

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly {
    x: number;
    y: number;
    z: number;
    rotationY?: number;
    scale?: number | [number, number, number];
    color?: THREE.Color;
  }[],
  name: string,
): InstancedSpec {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, placements.length));
  mesh.count = placements.length;
  mesh.name = name;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  placements.forEach((p, i) => {
    quaternion.setFromEuler(new THREE.Euler(0, p.rotationY ?? 0, 0));
    if (Array.isArray(p.scale)) scale.set(p.scale[0], p.scale[1], p.scale[2]);
    else scale.setScalar(p.scale ?? 1);
    matrix.compose(new THREE.Vector3(p.x, p.y, p.z), quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    if (p.color) mesh.setColorAt(i, p.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh };
}

const CAR_COLORS = [0x8c96a5, 0x5f6d7d, 0x9d8f7a, 0x7a8577, 0x596273, 0x8a7f8f].map(
  (c) => new THREE.Color(c),
);
const CONTAINER_COLORS = [0xa8574b, 0x4b7ba8, 0x67a04f, 0xb0913f, 0x777f8a, 0x8a5d9e].map(
  (c) => new THREE.Color(c),
);
const TREE_COLORS = [0x4d7a3a, 0x5d8a44, 0x3f6e35, 0x6d9350].map((c) => new THREE.Color(c));

/** Build every static mesh of the city. */
export function buildCity(): CityMeshes {
  const group = new THREE.Group();
  group.name = 'city';
  const plan = cityPlan();
  const buildings = plan.buildings;
  const rangedPicks = new Map<THREE.Object3D, readonly PickRange[]>();
  const objectPicks = new Map<THREE.Object3D, PickTarget>();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const farHidden: THREE.Object3D[] = [];

  // ------------------------------------------------------------- terrain
  const terrainMinX = WEST_COAST_X - 2300;
  const terrainMaxX = EAST_COAST_X + 2300;
  const terrainMinZ = CITY_BOUNDS.minZ - 2300;
  const terrainMaxZ = CITY_BOUNDS.maxZ + 2300;
  const terrainW = terrainMaxX - terrainMinX;
  const terrainD = terrainMaxZ - terrainMinZ;
  const terrainGeometry = new THREE.PlaneGeometry(terrainW, terrainD, 300, 240);
  terrainGeometry.rotateX(-Math.PI / 2);
  terrainGeometry.translate((terrainMinX + terrainMaxX) / 2, 0, (terrainMinZ + terrainMaxZ) / 2);
  {
    const position = terrainGeometry.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    const grass = new THREE.Color(0x66794c);
    const grassDry = new THREE.Color(0x8a8a55);
    const urban = new THREE.Color(0x83857c);
    const sand = new THREE.Color(0x9a8f6d);
    const seabed = new THREE.Color(0x2c4050);
    const c = new THREE.Color();
    // Distance to the nearest district zone drives the urban ground tint,
    // so pavement fades into green with no hard rectangle edge.
    const zones = DISTRICTS.map((d) => ({
      minX: d.bounds.x - d.bounds.width / 2,
      maxX: d.bounds.x + d.bounds.width / 2,
      minZ: d.bounds.z - d.bounds.depth / 2,
      maxZ: d.bounds.z + d.bounds.depth / 2,
    }));
    const zoneDistance = (x: number, z: number): number => {
      let best = Infinity;
      for (const zone of zones) {
        const dx = Math.max(zone.minX - x, 0, x - zone.maxX);
        const dz = Math.max(zone.minZ - z, 0, z - zone.maxZ);
        best = Math.min(best, Math.hypot(dx, dz));
        if (best === 0) break;
      }
      return best;
    };
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const h = terrainHeight(x, z);
      position.setY(i, h);
      const coastDistance = Math.min(x - WEST_COAST_X, EAST_COAST_X - x);
      if (h <= SEABED_HEIGHT + 0.01) {
        c.copy(seabed);
      } else if (coastDistance < 12) {
        c.copy(sand);
      } else {
        // Patchwork fields: large-scale hash tiles vary the green. The
        // variation fades with distance from the city so the far terrain
        // reads as haze-softened countryside, not compressed stripes.
        const beyond = Math.max(
          0,
          CITY_BOUNDS.minX - x,
          x - CITY_BOUNDS.maxX,
          CITY_BOUNDS.minZ - z,
          z - CITY_BOUNDS.maxZ,
        );
        const patchFade = Math.max(0, 1 - beyond / 320);
        const patch = hash01(`field:${Math.floor(x / 46)}:${Math.floor(z / 38)}`);
        const n = hash01(`terr:${Math.round(x / 9)}:${Math.round(z / 9)}`);
        c.copy(grass)
          .lerp(grassDry, patch * 0.75 * patchFade)
          .lerp(grass, n * 0.3);
        const urbanBlend = Math.max(0, 1 - zoneDistance(x, z) / 26);
        c.lerp(urban, urbanBlend * 0.85);
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    terrainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeometry.computeVertexNormals();
  }
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.name = 'terrain';
  terrain.receiveShadow = true;
  group.add(terrain);
  disposables.push(terrainGeometry, terrainMaterial);

  // --------------------------------------------------------------- water
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x22455e,
    roughness: 0.22,
    metalness: 0.55,
    transparent: true,
    opacity: 0.94,
    envMapIntensity: 1.2,
  });
  const waterGeometry = new THREE.PlaneGeometry(terrainW, terrainD);
  waterGeometry.rotateX(-Math.PI / 2);
  waterGeometry.translate(
    (terrainMinX + terrainMaxX) / 2,
    WATER_LEVEL,
    (terrainMinZ + terrainMaxZ) / 2,
  );
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.name = 'water';
  group.add(water);
  disposables.push(waterGeometry, waterMaterial);

  // ---------------------------------------------------------- quay walls
  const quayBucket = new Bucket();
  const quayHeight = PLAIN_HEIGHT - SEABED_HEIGHT + 0.4;
  for (const [x, flip] of [
    [WEST_COAST_X, 1],
    [EAST_COAST_X, -1],
  ] as const) {
    const geometry = new THREE.BoxGeometry(2.2, quayHeight, terrainD);
    transform(
      geometry,
      x - flip * 0.2,
      SEABED_HEIGHT + quayHeight / 2,
      (terrainMinZ + terrainMaxZ) / 2,
    );
    quayBucket.add(paint(geometry, new THREE.Color(0x7b7f85)));
  }
  // Piers: deck plus posts.
  for (const pier of plan.piers) {
    const w = pier.rect.maxX - pier.rect.minX;
    const d = pier.rect.maxZ - pier.rect.minZ;
    const cx = (pier.rect.minX + pier.rect.maxX) / 2;
    const cz = (pier.rect.minZ + pier.rect.maxZ) / 2;
    const deck = new THREE.BoxGeometry(w, 0.6, d);
    transform(deck, cx, PLAIN_HEIGHT - 0.3, cz);
    quayBucket.add(paint(deck, new THREE.Color(0x8d8272)));
    const postCount = Math.max(2, Math.floor(w / 9));
    for (let i = 0; i < postCount; i++) {
      for (const zEdge of [pier.rect.minZ + 1, pier.rect.maxZ - 1]) {
        const post = new THREE.CylinderGeometry(0.4, 0.4, PLAIN_HEIGHT - SEABED_HEIGHT, 6);
        transform(
          post,
          pier.rect.minX + (i + 0.5) * (w / postCount),
          SEABED_HEIGHT + (PLAIN_HEIGHT - SEABED_HEIGHT) / 2,
          zEdge,
        );
        quayBucket.add(paint(post, new THREE.Color(0x5c554a)));
      }
    }
  }
  const quayMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const quayMesh = quayBucket.build(quayMaterial, 'quays');
  if (quayMesh) {
    quayMesh.receiveShadow = true;
    quayMesh.castShadow = true;
    group.add(quayMesh);
    disposables.push(quayMesh.geometry, quayMaterial);
  }

  // ---------------------------------------------------------------- roads
  const roadLift = 0.08;
  const dashMaterial = new THREE.MeshStandardMaterial({
    map: roadTexture(true),
    roughness: 0.95,
  });
  const plainRoadMaterial = new THREE.MeshStandardMaterial({
    map: roadTexture(false),
    roughness: 0.95,
  });
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xa8a9a2, roughness: 0.95 });
  const medianMaterial = new THREE.MeshStandardMaterial({ color: 0x51683e, roughness: 1 });
  const dashBucket: THREE.BufferGeometry[] = [];
  const plainBucket: THREE.BufferGeometry[] = [];
  const sidewalkBucket: THREE.BufferGeometry[] = [];
  const medianBucket: THREE.BufferGeometry[] = [];
  for (const segment of plan.segments) {
    const sidewalkOffset = segment.width / 2 + segment.median / 2 + segment.sidewalk / 2;
    if (segment.roadClass === 'boulevard') {
      const laneOffset = segment.width / 4 + segment.median / 2;
      dashBucket.push(roadRibbon(segment, laneOffset, segment.width / 2, roadLift));
      dashBucket.push(roadRibbon(segment, -laneOffset, segment.width / 2, roadLift));
      medianBucket.push(roadRibbon(segment, 0, segment.median, roadLift + 0.14));
    } else {
      const bucket =
        segment.roadClass === 'local' || segment.roadClass === 'quay' ? plainBucket : dashBucket;
      bucket.push(roadRibbon(segment, 0, segment.width, roadLift));
    }
    sidewalkBucket.push(roadRibbon(segment, sidewalkOffset, segment.sidewalk, roadLift + 0.1));
    sidewalkBucket.push(roadRibbon(segment, -sidewalkOffset, segment.sidewalk, roadLift + 0.1));
  }
  const addMerged = (
    geometries: THREE.BufferGeometry[],
    material: THREE.Material,
    name: string,
    shadows = false,
  ): void => {
    if (geometries.length === 0) return;
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.castShadow = shadows;
    group.add(mesh);
    disposables.push(merged, material);
  };
  addMerged(dashBucket, dashMaterial, 'roads-marked');
  addMerged(plainBucket, plainRoadMaterial, 'roads-plain');
  addMerged(sidewalkBucket, sidewalkMaterial, 'sidewalks');
  addMerged(medianBucket, medianMaterial, 'medians');

  // Crosswalks.
  const crosswalkGeometries: THREE.BufferGeometry[] = [];
  for (const crosswalk of plan.crosswalks) {
    const geometry = new THREE.PlaneGeometry(crosswalk.width, 7);
    geometry.rotateX(-Math.PI / 2);
    if (!crosswalk.acrossHorizontal) geometry.rotateY(Math.PI / 2);
    const h = terrainHeight(crosswalk.position.x, crosswalk.position.z);
    geometry.translate(crosswalk.position.x, h + roadLift + 0.04, crosswalk.position.z);
    crosswalkGeometries.push(geometry);
  }
  addMerged(
    crosswalkGeometries,
    new THREE.MeshStandardMaterial({ map: crosswalkTexture(), roughness: 0.9 }),
    'crosswalks',
  );

  // -------------------------------------------------------- parcel ground
  const parkColor = new THREE.Color(0x55703f);
  const plazaColor = new THREE.Color(0x8f9089);
  const yardColor = new THREE.Color(0x6f6a5f);
  const groundBucket = new Bucket();
  const campusLawn = new THREE.Color(0x5f7c48);
  const campusApron = new THREE.Color(0x999e97);
  for (const parcel of plan.parcels) {
    let color =
      parcel.usage === 'park' ? parkColor : parcel.usage === 'plaza' ? plazaColor : yardColor;
    // The fenced QPU campus reads as kept grounds: lawns and pale aprons.
    if (parcel.districtId === 'qpu-grid') {
      color = parcel.usage === 'park' ? campusLawn : campusApron;
    }
    const geometry = groundPatch(
      parcel.rect.minX,
      parcel.rect.maxX,
      parcel.rect.minZ,
      parcel.rect.maxZ,
      0.05,
      color,
    );
    groundBucket.add(geometry, { kind: 'district', districtId: parcel.districtId });
  }
  // Outskirt ground: fields as tinted patches, groves darker, housing pale.
  const fieldColors = [0x7c8250, 0x8b8a52, 0x6d7c49, 0x94895a].map((c) => new THREE.Color(c));
  const groveColor = new THREE.Color(0x4c6a3d);
  const housingGround = new THREE.Color(0x7f8177);
  for (const parcel of plan.outskirts) {
    if (parcel.usage === 'open') continue;
    const color =
      parcel.usage === 'field'
        ? fieldColors[
            Math.floor(hash01(`${parcel.id}:fc`) * fieldColors.length) % fieldColors.length
          ]!
        : parcel.usage === 'grove'
          ? groveColor
          : housingGround;
    groundBucket.add(
      groundPatch(
        parcel.rect.minX + 1,
        parcel.rect.maxX - 1,
        parcel.rect.minZ + 1,
        parcel.rect.maxZ - 1,
        0.04,
        color,
      ),
    );
  }
  const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const groundMesh = groundBucket.build(groundMaterial, 'parcel-ground');
  if (groundMesh) {
    groundMesh.receiveShadow = true;
    group.add(groundMesh);
    rangedPicks.set(groundMesh, groundBucket.ranges);
    disposables.push(groundMesh.geometry, groundMaterial);
  }

  // ------------------------------------------------------------ buildings
  const facadeBuckets = new Map<Exclude<FacadeStyle, 'plain'>, Bucket>();
  const plainPartsBucket = new Bucket();
  const emissiveBuckets = new Map<string, Bucket>();
  const facadeMaterials: THREE.MeshStandardMaterial[] = [];

  const bucketFor = (style: Exclude<FacadeStyle, 'plain'>): Bucket => {
    let bucket = facadeBuckets.get(style);
    if (!bucket) {
      bucket = new Bucket();
      facadeBuckets.set(style, bucket);
    }
    return bucket;
  };
  const emissiveBucketFor = (districtId: string): Bucket => {
    let bucket = emissiveBuckets.get(districtId);
    if (!bucket) {
      bucket = new Bucket();
      emissiveBuckets.set(districtId, bucket);
    }
    return bucket;
  };

  const addPart = (building: Building, part: BuildingPart, baseY: number): void => {
    const target: PickTarget = {
      kind: 'building',
      buildingId: building.id,
      districtId: building.districtId,
    };
    const accent = new THREE.Color(getDistrict(building.districtId).accentColor);
    const toneColor = part.tone === 0 ? NEUTRAL_BODY : accent.clone().lerp(NEUTRAL_BODY, 0.45);
    const [ox, oy, oz] = part.offset;
    const [sx, sy, sz] = part.size;
    // Rotate the offset by the building rotation.
    const cos = Math.cos(building.rotationY);
    const sin = Math.sin(building.rotationY);
    const wx = building.position[0] + ox * cos + oz * sin;
    const wz = building.position[1] - ox * sin + oz * cos;
    const wy = baseY + oy;
    const rotation = building.rotationY + part.rotationY;
    const emissive = part.tone === 2;
    const bucket = emissive ? emissiveBucketFor(building.districtId) : plainPartsBucket;
    switch (part.kind) {
      case 'block':
      case 'tower':
      case 'platform':
      case 'container':
      case 'ship': {
        if (!emissive && part.facade && part.facade !== 'plain') {
          const walls = wallGeometry(sx, sy, sz);
          transform(walls, wx, wy, wz, rotation);
          bucketFor(part.facade).add(walls, target);
          const top = topGeometry(sx, sy, sz);
          transform(top, wx, wy, wz, rotation);
          plainPartsBucket.add(paint(top, ROOF_COLOR), target);
        } else {
          const box = new THREE.BoxGeometry(sx, sy, sz);
          transform(box, wx, wy + sy / 2, wz, rotation);
          bucket.add(emissive ? box : paint(box, toneColor), target);
        }
        break;
      }
      case 'cylinder':
      case 'chimney':
      case 'mast':
      case 'pylon': {
        const radius = sx / 2;
        const cylinder = new THREE.CylinderGeometry(radius * 0.92, radius, sy, 18);
        transform(cylinder, wx, wy + sy / 2, wz, rotation);
        bucket.add(emissive ? cylinder : paint(cylinder, toneColor), target);
        break;
      }
      case 'dome': {
        const dome = new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.scale(sx / 2, sy, sz / 2);
        transform(dome, wx, wy, wz, rotation);
        bucket.add(emissive ? dome : paint(dome, toneColor), target);
        break;
      }
      case 'dish': {
        const dish = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6);
        dish.scale(sx / 2, sy, sz / 2);
        dish.rotateX(Math.PI * 0.82);
        transform(dish, wx, wy + sy, wz, rotation);
        bucket.add(emissive ? dish : paint(dish, toneColor), target);
        break;
      }
      case 'wedge': {
        const wedge = wedgeGeometry(sx, sy, sz);
        transform(wedge, wx, wy, wz, rotation);
        bucket.add(
          emissive ? wedge : paint(wedge, ROOF_COLOR.clone().lerp(toneColor, 0.4)),
          target,
        );
        break;
      }
      case 'crane': {
        const post = new THREE.BoxGeometry(sx, sy, sx);
        transform(post, wx, wy + sy / 2, wz, rotation);
        bucket.add(emissive ? post : paint(post, toneColor), target);
        const jib = new THREE.BoxGeometry(sz, sx * 0.7, sx * 0.8);
        transform(jib, wx + (cos * sz) / 4, wy + sy, wz - (sin * sz) / 4, rotation);
        bucket.add(emissive ? jib.clone() : paint(jib, toneColor), target);
        const counter = new THREE.BoxGeometry(sz * 0.3, sx * 0.7, sx * 0.8);
        transform(counter, wx - (cos * sz) / 5, wy + sy, wz + (sin * sz) / 5, rotation);
        bucket.add(emissive ? counter : paint(counter, toneColor), target);
        break;
      }
      case 'bridge': {
        const bridge = new THREE.BoxGeometry(sx, sy, sz);
        transform(bridge, wx, wy + sy / 2, wz, rotation);
        bucket.add(emissive ? bridge : paint(bridge, toneColor), target);
        break;
      }
    }
  };

  /**
   * Furnished, enterable ground floor: wall segments with a real doorway,
   * floor, lit ceiling, furniture, and a band closing the gap up to the
   * original ground-part height so upper storeys still rest on something.
   */
  const buildInterior = (
    building: Building,
    interiorId: string,
    groundPart: BuildingPart,
    baseY: number,
  ): void => {
    const interior = INTERIORS.find((i) => i.id === interiorId);
    if (!interior) return;
    const target: PickTarget = {
      kind: 'building',
      buildingId: building.id,
      districtId: building.districtId,
    };
    const accent = new THREE.Color(getDistrict(building.districtId).accentColor);
    const [cx, cz] = interior.center;
    const wallColor = new THREE.Color(0xb9b3a2);
    const floorColor = new THREE.Color(0x8d887b);
    // The first five collision boxes are the wall segments (door gap
    // included); the rest are furniture, rendered separately below.
    for (const box of interiorCollisionBoxes(interior).slice(0, 5)) {
      const wall = new THREE.BoxGeometry(box.maxX - box.minX, interior.height, box.maxZ - box.minZ);
      transform(
        wall,
        (box.minX + box.maxX) / 2,
        baseY + interior.height / 2,
        (box.minZ + box.maxZ) / 2,
      );
      plainPartsBucket.add(paint(wall, wallColor), target);
    }
    const t = 1.2;
    const floor = new THREE.BoxGeometry(
      interior.halfW * 2 + t * 2,
      0.3,
      interior.halfD * 2 + t * 2,
    );
    transform(floor, cx, baseY + 0.15, cz);
    plainPartsBucket.add(paint(floor, floorColor), target);
    const ceiling = new THREE.BoxGeometry(
      interior.halfW * 2 + t * 2,
      0.4,
      interior.halfD * 2 + t * 2,
    );
    transform(ceiling, cx, baseY + interior.height + 0.2, cz);
    plainPartsBucket.add(paint(ceiling, wallColor), target);
    // Warm light panel under the ceiling so the room reads lit.
    const lightPanel = new THREE.BoxGeometry(interior.halfW * 1.2, 0.12, interior.halfD * 1.2);
    transform(lightPanel, cx, baseY + interior.height - 0.12, cz);
    emissiveBucketFor(building.districtId).add(lightPanel, target);
    // Band from the room ceiling up to the original ground-part height.
    const bandHeight = Math.max(0, groundPart.size[1] - interior.height - 0.4);
    if (bandHeight > 0.05) {
      const band = new THREE.BoxGeometry(groundPart.size[0], bandHeight, groundPart.size[2]);
      transform(
        band,
        building.position[0] + groundPart.offset[0],
        baseY + interior.height + 0.4 + bandHeight / 2,
        building.position[1] + groundPart.offset[2],
        building.rotationY + groundPart.rotationY,
      );
      plainPartsBucket.add(paint(band, wallColor), target);
    }
    // Furniture.
    for (const piece of interior.furniture) {
      const geometry = new THREE.BoxGeometry(piece.size[0], piece.size[1], piece.size[2]);
      transform(
        geometry,
        cx + piece.offset[0],
        baseY + 0.3 + piece.size[1] / 2,
        cz + piece.offset[1],
        piece.rotationY,
      );
      if (piece.kind === 'screen') {
        emissiveBucketFor(building.districtId).add(geometry, target);
      } else {
        const color =
          piece.kind === 'desk' || piece.kind === 'table'
            ? new THREE.Color(0x71614c)
            : piece.kind === 'shelf'
              ? new THREE.Color(0x5c5648)
              : accent.clone().lerp(new THREE.Color(0x888888), 0.5);
        plainPartsBucket.add(paint(geometry, color), target);
      }
    }
    // Door frame jambs and lintel mark the entrance.
    const door = doorPosition(interior);
    const doorY = baseY;
    const alongX = interior.doorSide === 'north' || interior.doorSide === 'south';
    const frameColor = new THREE.Color(0x4c4a44);
    for (const side of [-1, 1]) {
      const jamb = new THREE.BoxGeometry(alongX ? 0.5 : 1.6, 4.2, alongX ? 1.6 : 0.5);
      transform(
        jamb,
        door.x + (alongX ? side * (interior.doorWidth / 2 + 0.3) : 0),
        doorY + 2.1,
        door.z + (alongX ? 0 : side * (interior.doorWidth / 2 + 0.3)),
      );
      plainPartsBucket.add(paint(jamb, frameColor), target);
    }
    const lintel = new THREE.BoxGeometry(
      alongX ? interior.doorWidth + 1.2 : 1.6,
      0.5,
      alongX ? 1.6 : interior.doorWidth + 1.2,
    );
    transform(lintel, door.x, doorY + 4.45, door.z);
    plainPartsBucket.add(paint(lintel, frameColor), target);
  };

  for (const building of buildings) {
    const baseY = terrainHeight(building.position[0], building.position[1]);
    // Foundation plinth seats the building on any slope.
    const plinth = new THREE.BoxGeometry(
      building.collisionHalfExtents[0] * 2 + 0.8,
      2.4,
      building.collisionHalfExtents[1] * 2 + 0.8,
    );
    transform(plinth, building.position[0], baseY - 0.85, building.position[1], building.rotationY);
    plainPartsBucket.add(paint(plinth, PLINTH_COLOR), {
      kind: 'building',
      buildingId: building.id,
      districtId: building.districtId,
    });
    const interiorId = INTERIOR_BUILDING_IDS[building.id];
    building.parts.forEach((part, index) => {
      if (interiorId && index === 0) {
        // The ground part is replaced by the enterable room.
        buildInterior(building, interiorId, part, baseY + 0.35);
        return;
      }
      addPart(building, part, baseY + 0.35);
    });
  }

  for (const [style, bucket] of facadeBuckets) {
    const textures = facadeTextures(style);
    const material = new THREE.MeshStandardMaterial({
      map: textures.map,
      emissiveMap: textures.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: textures.roughness,
      metalness: textures.metalness,
    });
    facadeMaterials.push(material);
    const mesh = bucket.build(material, `facade-${style}`);
    if (mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      rangedPicks.set(mesh, bucket.ranges);
      disposables.push(mesh.geometry, material);
    }
  }
  const plainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const plainMesh = plainPartsBucket.build(plainMaterial, 'building-parts');
  if (plainMesh) {
    plainMesh.castShadow = true;
    plainMesh.receiveShadow = true;
    group.add(plainMesh);
    rangedPicks.set(plainMesh, plainPartsBucket.ranges);
    disposables.push(plainMesh.geometry, plainMaterial);
  }
  // District accent architecture doubles as the activity indicator: the
  // engine raises a district's accent glow while its stage fires.
  const districtAccents = new Map<string, THREE.Mesh>();
  for (const [districtId, bucket] of emissiveBuckets) {
    const accent = new THREE.Color(getDistrict(districtId as never).accentColor);
    const material = new THREE.MeshStandardMaterial({
      color: accent.clone().multiplyScalar(0.4),
      emissive: accent,
      emissiveIntensity: 0.8,
      roughness: 0.4,
    });
    const mesh = bucket.build(material, `accent-${districtId}`);
    if (mesh) {
      mesh.castShadow = true;
      group.add(mesh);
      rangedPicks.set(mesh, bucket.ranges);
      districtAccents.set(districtId, mesh);
      disposables.push(mesh.geometry, material);
    }
  }

  // ------------------------------------------------------------ QPU fence
  const fenceRailBucket = new Bucket();
  const railColor = new THREE.Color(0x767c85);
  const railY = terrainHeight(QPU_CAMPUS.minX, QPU_CAMPUS.minZ);
  const rails: [number, number, number, number][] = [
    [QPU_CAMPUS.minX, QPU_CAMPUS.minZ, QPU_CAMPUS.minX, QPU_GATE.minZ],
    [QPU_CAMPUS.minX, QPU_GATE.maxZ, QPU_CAMPUS.minX, QPU_CAMPUS.maxZ],
    [QPU_CAMPUS.maxX, QPU_CAMPUS.minZ, QPU_CAMPUS.maxX, QPU_CAMPUS.maxZ],
    [QPU_CAMPUS.minX, QPU_CAMPUS.minZ, QPU_CAMPUS.maxX, QPU_CAMPUS.minZ],
    [QPU_CAMPUS.minX, QPU_CAMPUS.maxZ, QPU_CAMPUS.maxX, QPU_CAMPUS.maxZ],
  ];
  for (const [x1, z1, x2, z2] of rails) {
    const length = Math.hypot(x2 - x1, z2 - z1);
    if (length < 1) continue;
    for (const railHeight of [1.0, 1.9]) {
      const rail = new THREE.BoxGeometry(
        Math.abs(x2 - x1) > Math.abs(z2 - z1) ? length : 0.12,
        0.12,
        Math.abs(x2 - x1) > Math.abs(z2 - z1) ? 0.12 : length,
      );
      transform(rail, (x1 + x2) / 2, railY + railHeight, (z1 + z2) / 2);
      fenceRailBucket.add(paint(rail, railColor));
    }
  }
  const fenceMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0.4,
  });
  const fenceMesh = fenceRailBucket.build(fenceMaterial, 'campus-rails');
  if (fenceMesh) {
    group.add(fenceMesh);
    disposables.push(fenceMesh.geometry, fenceMaterial);
  }

  // ----------------------------------------------------------- prop sets
  const byKind = new Map<Prop['kind'], Prop[]>();
  for (const prop of plan.props) {
    const list = byKind.get(prop.kind) ?? [];
    list.push(prop);
    byKind.set(prop.kind, list);
  }
  const propY = (p: Prop): number => terrainHeight(p.position.x, p.position.z);

  // Lamps: pole plus emissive head.
  const lamps = byKind.get('lamp') ?? [];
  const lampPoleMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c4046,
    roughness: 0.6,
    metalness: 0.5,
  });
  const lampPole = makeInstanced(
    new THREE.CylinderGeometry(0.09, 0.13, 5.4, 6),
    lampPoleMaterial,
    lamps.map((p) => ({ x: p.position.x, y: propY(p) + 2.7, z: p.position.z })),
    'lamp-poles',
  );
  const lampHeadMaterial = new THREE.MeshStandardMaterial({
    color: 0x565c63,
    emissive: 0xffd9a0,
    emissiveIntensity: 0,
  });
  const lampHead = makeInstanced(
    new THREE.SphereGeometry(0.22, 8, 6),
    lampHeadMaterial,
    lamps.map((p) => ({ x: p.position.x, y: propY(p) + 5.35, z: p.position.z })),
    'lamp-heads',
  );
  // Warm light pools under the lamps sell the night streets without the
  // cost of real point lights.
  const lampPoolMaterial = new THREE.MeshBasicMaterial({
    color: 0xffca7a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const lampPool = makeInstanced(
    new THREE.CircleGeometry(4.6, 14).rotateX(-Math.PI / 2),
    lampPoolMaterial,
    lamps.map((p) => ({ x: p.position.x, y: propY(p) + 0.16, z: p.position.z })),
    'lamp-pools',
  );
  lampPool.mesh.castShadow = false;
  lampPool.mesh.receiveShadow = false;
  group.add(lampPole.mesh, lampHead.mesh, lampPool.mesh);

  // Trees: trunk plus canopy; a mix of round deciduous crowns and conifer
  // cones so greenery does not read as one repeated blob.
  const trees = byKind.get('tree') ?? [];
  const deciduous = trees.filter((p) => p.variant >= 0.3);
  const conifers = trees.filter((p) => p.variant < 0.3);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const trunk = makeInstanced(
    new THREE.CylinderGeometry(0.16, 0.24, 2.4, 5),
    trunkMaterial,
    trees.map((p) => ({
      x: p.position.x,
      y: propY(p) + 1.2,
      z: p.position.z,
      scale: [1, 0.8 + p.variant * 0.6, 1] as [number, number, number],
    })),
    'tree-trunks',
  );
  const canopyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const canopy = makeInstanced(
    new THREE.IcosahedronGeometry(1.7, 1),
    canopyMaterial,
    deciduous.map((p) => ({
      x: p.position.x,
      y: propY(p) + 2.4 + p.variant * 1.1,
      z: p.position.z,
      rotationY: p.rotationY,
      scale: [
        0.75 + p.variant * 0.5,
        0.85 + p.variant * 0.6,
        0.75 + ((p.variant * 7) % 1) * 0.45,
      ] as [number, number, number],
      color: TREE_COLORS[Math.floor(p.variant * TREE_COLORS.length) % TREE_COLORS.length]!,
    })),
    'tree-canopies',
  );
  const coniferMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const conifer = makeInstanced(
    new THREE.ConeGeometry(1.35, 4.6, 7),
    coniferMaterial,
    conifers.map((p) => ({
      x: p.position.x,
      y: propY(p) + 3.5,
      z: p.position.z,
      rotationY: p.rotationY,
      scale: [0.8 + p.variant, 0.8 + p.variant * 1.4, 0.8 + p.variant] as [number, number, number],
      color: TREE_COLORS[(Math.floor(p.variant * 17) + 2) % TREE_COLORS.length]!,
    })),
    'tree-conifers',
  );
  group.add(trunk.mesh, canopy.mesh, conifer.mesh);

  // Benches.
  const benches = byKind.get('bench') ?? [];
  const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x6e5a41, roughness: 0.9 });
  const bench = makeInstanced(
    new THREE.BoxGeometry(1.8, 0.5, 0.6),
    benchMaterial,
    benches.map((p) => ({
      x: p.position.x,
      y: propY(p) + 0.3,
      z: p.position.z,
      rotationY: p.rotationY,
    })),
    'benches',
  );
  group.add(bench.mesh);
  farHidden.push(bench.mesh);

  // Containers.
  const containers = byKind.get('container') ?? [];
  const containerMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.25 });
  const container = makeInstanced(
    new THREE.BoxGeometry(6.1, 2.6, 2.5),
    containerMaterial,
    containers.map((p) => ({
      x: p.position.x,
      y: propY(p) + 1.3 + (p.variant > 0.72 ? 2.6 : 0),
      z: p.position.z,
      rotationY: p.rotationY + (p.variant > 0.5 ? Math.PI / 2 : 0),
      color:
        CONTAINER_COLORS[
          Math.floor(p.variant * CONTAINER_COLORS.length) % CONTAINER_COLORS.length
        ]!,
    })),
    'containers',
  );
  group.add(container.mesh);

  // Parked cars.
  const parked = byKind.get('parked-car') ?? [];
  const carBodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 });
  const parkedBody = makeInstanced(
    new THREE.BoxGeometry(4.1, 1.1, 1.8),
    carBodyMaterial,
    parked.map((p) => ({
      x: p.position.x,
      y: propY(p) + 0.62,
      z: p.position.z,
      rotationY: p.rotationY,
      color: CAR_COLORS[Math.floor(p.variant * CAR_COLORS.length) % CAR_COLORS.length]!,
    })),
    'parked-car-bodies',
  );
  const carTopMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c3138,
    roughness: 0.2,
    metalness: 0.4,
  });
  const parkedTop = makeInstanced(
    new THREE.BoxGeometry(2.1, 0.75, 1.6),
    carTopMaterial,
    parked.map((p) => ({
      x: p.position.x - Math.sin(p.rotationY) * 0.3,
      y: propY(p) + 1.5,
      z: p.position.z - Math.cos(p.rotationY) * 0.3,
      rotationY: p.rotationY,
    })),
    'parked-car-tops',
  );
  group.add(parkedBody.mesh, parkedTop.mesh);
  farHidden.push(parkedBody.mesh, parkedTop.mesh);

  // Fence posts.
  const posts = byKind.get('fence-post') ?? [];
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x767c85,
    roughness: 0.6,
    metalness: 0.4,
  });
  const post = makeInstanced(
    new THREE.BoxGeometry(0.16, 2.1, 0.16),
    postMaterial,
    posts.map((p) => ({ x: p.position.x, y: propY(p) + 1.05, z: p.position.z })),
    'fence-posts',
  );
  group.add(post.mesh);
  farHidden.push(post.mesh);

  // Buoys.
  const buoys = byKind.get('buoy') ?? [];
  const buoyMaterial = new THREE.MeshStandardMaterial({ color: 0xc2543a, roughness: 0.6 });
  const buoy = makeInstanced(
    new THREE.SphereGeometry(0.7, 8, 6),
    buoyMaterial,
    buoys.map((p) => ({ x: p.position.x, y: WATER_LEVEL + 0.35, z: p.position.z })),
    'buoys',
  );
  group.add(buoy.mesh);
  farHidden.push(buoy.mesh);

  // Ships: hull, superstructure, mast per ship.
  const ships = byKind.get('ship') ?? [];
  const shipBucket = new Bucket();
  for (const [i, ship] of ships.entries()) {
    const hullColor = new THREE.Color().setHSL(0.55 + ship.variant * 0.2, 0.25, 0.32);
    const hull = new THREE.BoxGeometry(14, 3.4, 34);
    transform(hull, ship.position.x, WATER_LEVEL + 1.1, ship.position.z, ship.rotationY);
    shipBucket.add(paint(hull, hullColor));
    const bow = wedgeGeometry(14, 2.4, 10);
    bow.rotateX(Math.PI / 2);
    transform(
      bow,
      ship.position.x + Math.sin(ship.rotationY) * 21,
      WATER_LEVEL + 2.6,
      ship.position.z + Math.cos(ship.rotationY) * 21,
      ship.rotationY,
    );
    shipBucket.add(paint(bow, hullColor));
    const castle = new THREE.BoxGeometry(9, 5.4, 7);
    transform(
      castle,
      ship.position.x - Math.sin(ship.rotationY) * 11,
      WATER_LEVEL + 5.4,
      ship.position.z - Math.cos(ship.rotationY) * 11,
      ship.rotationY,
    );
    shipBucket.add(paint(castle, new THREE.Color(0xd9dade)));
    const mast = new THREE.CylinderGeometry(0.14, 0.18, 6, 5);
    transform(mast, ship.position.x, WATER_LEVEL + 11, ship.position.z, ship.rotationY);
    shipBucket.add(paint(mast, new THREE.Color(0x8a8f96)));
    void i;
  }
  const shipMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const shipMesh = shipBucket.build(shipMaterial, 'ships');
  if (shipMesh) {
    shipMesh.castShadow = true;
    group.add(shipMesh);
    disposables.push(shipMesh.geometry, shipMaterial);
  }

  // ------------------------------------------------- interactive consoles
  const interactiveMeshes = new Map<string, THREE.Mesh>();
  const kioskGeometry = new THREE.BoxGeometry(1.4, 2.4, 1.0);
  const screenGeometry = new THREE.PlaneGeometry(1.05, 0.7);
  for (const interactive of INTERACTIVES) {
    const district = getDistrict(interactive.districtId);
    const accent = new THREE.Color(district.accentColor);
    const y = terrainHeight(interactive.position[0], interactive.position[1]);
    const kioskMaterial = new THREE.MeshStandardMaterial({
      color: 0x22262d,
      roughness: 0.5,
      metalness: 0.3,
    });
    const kiosk = new THREE.Mesh(kioskGeometry, kioskMaterial);
    kiosk.position.set(interactive.position[0], y + 1.2, interactive.position[1]);
    kiosk.name = `interactive-${interactive.id}`;
    kiosk.castShadow = true;
    const screenMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c0f14,
      emissive: accent,
      emissiveIntensity: 0.9,
      roughness: 0.3,
    });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.set(0, 0.55, 0.52);
    screen.rotation.x = -0.18;
    kiosk.add(screen);
    group.add(kiosk);
    interactiveMeshes.set(interactive.id, kiosk);
    objectPicks.set(kiosk, { kind: 'interactive', interactiveId: interactive.id });
    disposables.push(kioskMaterial, screenMaterial);
  }
  disposables.push(kioskGeometry, screenGeometry);

  // -------------------------------------------------------- time of day
  const applyTimeOfDay = (time: TimeOfDay): void => {
    const windowGlow = time === 'night' ? 1.6 : time === 'golden' ? 0.5 : 0;
    for (const material of facadeMaterials) {
      material.emissiveIntensity = windowGlow;
    }
    lampHeadMaterial.emissiveIntensity = time === 'night' ? 2.2 : time === 'golden' ? 1.1 : 0;
    lampPoolMaterial.opacity = time === 'night' ? 0.42 : time === 'golden' ? 0.12 : 0;
    for (const mesh of districtAccents.values()) {
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = accentBaseIntensity(time);
    }
  };

  return {
    group,
    rangedPicks,
    objectPicks,
    buildings,
    interactiveMeshes,
    districtAccents,
    farHidden,
    waterMaterial,
    applyTimeOfDay,
    dispose: () => {
      for (const item of disposables) item.dispose();
      for (const spec of [
        lampPole,
        lampHead,
        lampPool,
        trunk,
        canopy,
        conifer,
        bench,
        container,
        parkedBody,
        parkedTop,
        post,
        buoy,
      ]) {
        spec.mesh.geometry.dispose();
        (spec.mesh.material as THREE.Material).dispose();
        spec.mesh.dispose();
      }
    },
  };
}

/** QPU pylons and coupling bridges for a device topology (unchanged API). */
export interface QpuMeshes {
  readonly group: THREE.Group;
  readonly pylons: THREE.Mesh[];
  readonly bridges: Map<string, THREE.Mesh>;
  dispose(): void;
}

export function buildQpu(
  positions: readonly (readonly [number, number])[],
  edges: readonly (readonly [number, number])[],
  accentColor: string,
  pylonWorld: readonly (readonly [number, number])[],
): QpuMeshes {
  const group = new THREE.Group();
  group.name = 'qpu';
  const accent = new THREE.Color(accentColor);
  const pylons: THREE.Mesh[] = [];
  void positions;
  pylonWorld.forEach(([x, z], i) => {
    const y = terrainHeight(x, z);
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.6, 9, 12),
      new THREE.MeshStandardMaterial({
        color: 0x232833,
        emissive: accent,
        emissiveIntensity: 0.18,
        roughness: 0.5,
      }),
    );
    pylon.position.set(x, y + 4.5, z);
    pylon.castShadow = true;
    pylon.name = `qubit-${i}`;
    group.add(pylon);
    pylons.push(pylon);
  });
  const bridges = new Map<string, THREE.Mesh>();
  for (const [a, b] of edges) {
    const [ax, az] = pylonWorld[a]!;
    const [bx, bz] = pylonWorld[b]!;
    const y = (terrainHeight(ax, az) + terrainHeight(bx, bz)) / 2;
    const length = Math.hypot(bx - ax, bz - az);
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(2, length - 4), 0.8, 1.3),
      new THREE.MeshStandardMaterial({
        color: 0x232833,
        emissive: accent,
        emissiveIntensity: 0.12,
        roughness: 0.5,
      }),
    );
    bridge.position.set((ax + bx) / 2, y + 7.5, (az + bz) / 2);
    bridge.rotation.y = -Math.atan2(bz - az, bx - ax);
    bridge.name = `coupling-${a}-${b}`;
    group.add(bridge);
    bridges.set(`${Math.min(a, b)}-${Math.max(a, b)}`, bridge);
  }
  return {
    group,
    pylons,
    bridges,
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
    },
  };
}
