import * as THREE from 'three';
import {
  DISTRICTS,
  generateBuildings,
  qpuPylonPositions,
  INTERACTIVES,
  BOULEVARD,
  type Building,
  type Interactive,
} from '@qsimcity/world';

/**
 * Instanced city construction: the entire building stock renders as three
 * instanced meshes (boxes, cylinders, spheres) so draw calls stay constant
 * regardless of city size (spec §19).
 */

export interface PickTarget {
  readonly kind: 'building' | 'district' | 'qubit' | 'interactive';
  readonly buildingId?: string;
  readonly districtId?: string;
  readonly qubit?: number;
  readonly interactiveId?: string;
}

export interface CityMeshes {
  readonly group: THREE.Group;
  readonly boxes: THREE.InstancedMesh;
  readonly cylinders: THREE.InstancedMesh;
  readonly spheres: THREE.InstancedMesh;
  readonly pickTargets: Map<THREE.Object3D, PickTarget[]>;
  readonly districtPlates: Map<string, THREE.Mesh>;
  readonly interactiveMeshes: Map<string, THREE.Mesh>;
  readonly buildings: readonly Building[];
  setNight(night: boolean): void;
  dispose(): void;
}

const BODY_DAY = new THREE.Color('#b8bec8');
const BODY_NIGHT = new THREE.Color('#3c4250');

interface InstanceRecord {
  readonly matrix: THREE.Matrix4;
  readonly tone: 0 | 1 | 2;
  readonly accent: THREE.Color;
  readonly target: PickTarget;
}

export function buildCity(): CityMeshes {
  const group = new THREE.Group();
  group.name = 'city';
  const buildings = generateBuildings();

  const boxRecords: InstanceRecord[] = [];
  const cylRecords: InstanceRecord[] = [];
  const sphereRecords: InstanceRecord[] = [];

  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpEuler = new THREE.Euler();

  for (const building of buildings) {
    const district = DISTRICTS.find((d) => d.id === building.districtId)!;
    const accent = new THREE.Color(district.accentColor);
    const target: PickTarget = {
      kind: 'building',
      buildingId: building.id,
      districtId: building.districtId,
    };
    const baseRot = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, building.rotationY, 0),
    );
    for (const part of building.parts) {
      const [ox, oy, oz] = part.offset;
      const [sx, sy, sz] = part.size;
      // Rotate the offset by the building rotation.
      tmpPos.set(ox, 0, oz).applyQuaternion(baseRot);
      tmpPos.x += building.position[0];
      tmpPos.z += building.position[1];
      tmpQuat.setFromEuler(tmpEuler.set(0, building.rotationY + part.rotationY, 0));
      const record = (matrix: THREE.Matrix4): InstanceRecord => ({
        matrix,
        tone: part.tone,
        accent,
        target,
      });
      switch (part.kind) {
        case 'block':
        case 'tower':
        case 'platform':
        case 'container':
        case 'ship': {
          tmpPos.y = oy + sy / 2;
          tmpScale.set(sx, sy, sz);
          boxRecords.push(record(new THREE.Matrix4().compose(tmpPos.clone(), tmpQuat.clone(), tmpScale.clone())));
          break;
        }
        case 'chimney':
        case 'mast': {
          tmpPos.y = oy + sy / 2;
          tmpScale.set(sx, sy, sx);
          cylRecords.push(record(new THREE.Matrix4().compose(tmpPos.clone(), tmpQuat.clone(), tmpScale.clone())));
          break;
        }
        case 'cylinder': {
          tmpPos.y = oy + sy / 2;
          tmpScale.set(sx, sy, sx);
          cylRecords.push(record(new THREE.Matrix4().compose(tmpPos.clone(), tmpQuat.clone(), tmpScale.clone())));
          break;
        }
        case 'dome':
        case 'dish': {
          tmpPos.y = oy + (part.kind === 'dome' ? 0 : sy / 2);
          tmpScale.set(sx, sy, sz);
          sphereRecords.push(record(new THREE.Matrix4().compose(tmpPos.clone(), tmpQuat.clone(), tmpScale.clone())));
          break;
        }
        case 'crane': {
          // Vertical post + horizontal jib, both boxes.
          const post = new THREE.Matrix4().compose(
            new THREE.Vector3(tmpPos.x, oy + sy / 2, tmpPos.z),
            tmpQuat.clone(),
            new THREE.Vector3(sx, sy, sx),
          );
          const jib = new THREE.Matrix4().compose(
            new THREE.Vector3(tmpPos.x, oy + sy, tmpPos.z),
            tmpQuat.clone(),
            new THREE.Vector3(sz, sx, sx * 0.8),
          );
          boxRecords.push(record(post), record(jib));
          break;
        }
        case 'pylon':
        case 'bridge': {
          tmpPos.y = oy + sy / 2;
          tmpScale.set(sx, sy, sz);
          boxRecords.push(record(new THREE.Matrix4().compose(tmpPos.clone(), tmpQuat.clone(), tmpScale.clone())));
          break;
        }
      }
    }
  }

  const makeInstanced = (
    geometry: THREE.BufferGeometry,
    records: InstanceRecord[],
    name: string,
  ): { mesh: THREE.InstancedMesh; records: InstanceRecord[] } => {
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.82,
      metalness: 0.12,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, records.length));
    mesh.name = name;
    mesh.count = records.length;
    records.forEach((r, i) => mesh.setMatrixAt(i, r.matrix));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.instanceMatrix.needsUpdate = true;
    return { mesh, records };
  };

  const boxes = makeInstanced(new THREE.BoxGeometry(1, 1, 1), boxRecords, 'city-boxes');
  const cylinders = makeInstanced(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    cylRecords,
    'city-cylinders',
  );
  const spheres = makeInstanced(
    new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    sphereRecords,
    'city-spheres',
  );
  group.add(boxes.mesh, cylinders.mesh, spheres.mesh);

  const pickTargets = new Map<THREE.Object3D, PickTarget[]>();
  pickTargets.set(boxes.mesh, boxRecords.map((r) => r.target));
  pickTargets.set(cylinders.mesh, cylRecords.map((r) => r.target));
  pickTargets.set(spheres.mesh, sphereRecords.map((r) => r.target));

  // District ground plates.
  const districtPlates = new Map<string, THREE.Mesh>();
  for (const d of DISTRICTS) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(d.bounds.width, 0.6, d.bounds.depth),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(d.accentColor).multiplyScalar(0.25),
        emissive: new THREE.Color(d.accentColor),
        emissiveIntensity: 0.05,
        roughness: 0.9,
      }),
    );
    plate.position.set(d.bounds.x, -0.3, d.bounds.z);
    plate.name = `district-${d.id}`;
    group.add(plate);
    districtPlates.set(d.id, plate);
    pickTargets.set(plate, [{ kind: 'district', districtId: d.id }]);
  }

  // Boulevard road ribbon.
  for (let i = 0; i + 1 < BOULEVARD.length; i++) {
    const [x1, z1] = BOULEVARD[i]!;
    const [x2, z2] = BOULEVARD[i + 1]!;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(len, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: '#2a2e38', roughness: 1 }),
    );
    road.position.set((x1 + x2) / 2, 0.11, (z1 + z2) / 2);
    road.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    group.add(road);
  }

  // Interactive consoles: emissive kiosks.
  const interactiveMeshes = new Map<string, THREE.Mesh>();
  for (const interactive of INTERACTIVES as readonly Interactive[]) {
    const district = DISTRICTS.find((d) => d.id === interactive.districtId)!;
    const kiosk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.5, 2.6, 8),
      new THREE.MeshStandardMaterial({
        color: '#1c2028',
        emissive: new THREE.Color(district.accentColor),
        emissiveIntensity: 0.9,
        roughness: 0.4,
      }),
    );
    kiosk.position.set(interactive.position[0], 1.3, interactive.position[1]);
    kiosk.name = `interactive-${interactive.id}`;
    group.add(kiosk);
    interactiveMeshes.set(interactive.id, kiosk);
    pickTargets.set(kiosk, [{ kind: 'interactive', interactiveId: interactive.id }]);
  }

  const applyTones = (night: boolean): void => {
    const body = night ? BODY_NIGHT : BODY_DAY;
    for (const { mesh, records } of [boxes, cylinders, spheres]) {
      records.forEach((r, i) => {
        const color =
          r.tone === 0
            ? body
            : r.tone === 1
              ? r.accent.clone().lerp(body, night ? 0.15 : 0.45)
              : r.accent.clone().multiplyScalar(night ? 1.4 : 1.0);
        mesh.setColorAt(i, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };
  applyTones(true);

  return {
    group,
    boxes: boxes.mesh,
    cylinders: cylinders.mesh,
    spheres: spheres.mesh,
    pickTargets,
    districtPlates,
    interactiveMeshes,
    buildings,
    setNight: applyTones,
    dispose: () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
    },
  };
}

/** QPU pylons and coupling bridges for a device topology. */
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
): QpuMeshes {
  const group = new THREE.Group();
  group.name = 'qpu';
  const world = qpuPylonPositions(positions);
  const accent = new THREE.Color(accentColor);
  const pylons: THREE.Mesh[] = [];
  world.forEach(([x, z], i) => {
    const pylon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.8, 9, 10),
      new THREE.MeshStandardMaterial({
        color: '#232833',
        emissive: accent,
        emissiveIntensity: 0.18,
        roughness: 0.5,
      }),
    );
    pylon.position.set(x, 4.5, z);
    pylon.name = `qubit-${i}`;
    group.add(pylon);
    pylons.push(pylon);
  });
  const bridges = new Map<string, THREE.Mesh>();
  for (const [a, b] of edges) {
    const [ax, az] = world[a]!;
    const [bx, bz] = world[b]!;
    const len = Math.hypot(bx - ax, bz - az);
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(len - 4, 0.8, 1.4),
      new THREE.MeshStandardMaterial({
        color: '#232833',
        emissive: accent,
        emissiveIntensity: 0.12,
        roughness: 0.5,
      }),
    );
    bridge.position.set((ax + bx) / 2, 7.5, (az + bz) / 2);
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
