import * as THREE from 'three';
import { terrainHeight, type PedestrianState, type VehicleState } from '@qsimcity/world';
import type { TimeOfDay } from './sky.js';

/**
 * Vehicle and pedestrian rendering (spec §4). Semantic vehicles (the job
 * convoy and classical couriers) and illustrative ambient traffic are all
 * instanced; their positions come from the pure derivations in
 * @qsimcity/world — this module only draws states, it never invents them.
 */

const AMBIENT_CAPACITY = 24;
const COURIER_CAPACITY = 16;
const PEDESTRIAN_CAPACITY = 96;

// Kept well above mid-grey with low metalness: a moving car photographed in
// building shade must still read as a car, not an untextured black box
// (adversarial art review — the same lesson as the parked fleet).
const AMBIENT_COLORS = [0x9aa8b6, 0x8a97a5, 0xb2a58f, 0x93a08f, 0x8b95a4, 0xa494a8, 0xbcb1a4].map(
  (c) => new THREE.Color(c),
);
const COURIER_COLOR = new THREE.Color(0x3a6ad8);
const PEDESTRIAN_COLORS = [0x8a6f5c, 0x5c748a, 0x6f8a5c, 0x8a5c74, 0x707a85].map(
  (c) => new THREE.Color(c),
);

// Shared scratch matrix: setInstance runs for every instance every frame,
// and allocating a Matrix4 per call is measurable GC churn on low-end
// devices (performance review finding).
const SCRATCH_MATRIX = new THREE.Matrix4();

function setInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  color?: THREE.Color,
): void {
  SCRATCH_MATRIX.makeRotationY(rotationY);
  SCRATCH_MATRIX.setPosition(x, y, z);
  mesh.setMatrixAt(index, SCRATCH_MATRIX);
  if (color) mesh.setColorAt(index, color);
}

export interface VehicleFleet {
  readonly group: THREE.Group;
  /** Update semantic vehicles (called when the playback tick changes). */
  setSemantic(convoy: VehicleState | null, couriers: readonly VehicleState[]): void;
  /** Per-frame update: smooth convoy motion and ambient life. */
  update(
    dt: number,
    ambient: readonly VehicleState[],
    pedestrians: readonly PedestrianState[],
    reducedMotion: boolean,
  ): void;
  applyTimeOfDay(time: TimeOfDay): void;
  dispose(): void;
}

export function buildVehicles(): VehicleFleet {
  const group = new THREE.Group();
  group.name = 'vehicles';
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  // ------------------------------------------------------------- convoy
  // The job convoy: a flatbed truck carrying the glowing program crate.
  // It is a job marker, never a quantum state.
  const convoyGroup = new THREE.Group();
  convoyGroup.name = 'job-convoy';
  const cabMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8edf2,
    roughness: 0.4,
    metalness: 0.3,
  });
  const bedMaterial = new THREE.MeshStandardMaterial({ color: 0x39404a, roughness: 0.7 });
  const crateMaterial = new THREE.MeshStandardMaterial({
    color: 0x224455,
    emissive: 0x66ccff,
    emissiveIntensity: 1.3,
    roughness: 0.3,
  });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 1.9), cabMaterial);
  cab.position.set(0, 1.5, 3.2);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 7.4), bedMaterial);
  bed.position.set(0, 0.75, -0.6);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.0, 4.4), crateMaterial);
  crate.position.set(0, 2.1, -1.2);
  const wheels: THREE.Mesh[] = [];
  const wheelGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  for (const [wx, wz] of [
    [-1.1, 3.2],
    [1.1, 3.2],
    [-1.1, -2.6],
    [1.1, -2.6],
    [-1.1, 0.4],
    [1.1, 0.4],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.position.set(wx, 0.55, wz);
    wheels.push(wheel);
    convoyGroup.add(wheel);
  }
  cab.castShadow = true;
  crate.castShadow = true;
  convoyGroup.add(cab, bed, crate);
  convoyGroup.visible = false;
  group.add(convoyGroup);
  disposables.push(
    cab.geometry,
    bed.geometry,
    crate.geometry,
    wheelGeometry,
    cabMaterial,
    bedMaterial,
    crateMaterial,
    wheelMaterial,
  );

  // ------------------------------------------------------------ couriers
  const courierBodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.35 });
  const courierBody = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.9, 1.7, 3.6),
    courierBodyMaterial,
    COURIER_CAPACITY,
  );
  courierBody.name = 'courier-bodies';
  courierBody.castShadow = true;
  const courierLightMaterial = new THREE.MeshStandardMaterial({
    color: 0x223344,
    emissive: 0x66aaff,
    emissiveIntensity: 1.4,
    roughness: 0.4,
  });
  const courierLight = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.6, 0.3, 0.6),
    courierLightMaterial,
    COURIER_CAPACITY,
  );
  courierLight.name = 'courier-lights';
  group.add(courierBody, courierLight);
  disposables.push(
    courierBody.geometry,
    courierBodyMaterial,
    courierLight.geometry,
    courierLightMaterial,
  );

  // ------------------------------------------------------- ambient cars
  const ambientBodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 });
  const ambientBody = new THREE.InstancedMesh(
    new THREE.BoxGeometry(4.0, 1.1, 1.8),
    ambientBodyMaterial,
    AMBIENT_CAPACITY,
  );
  ambientBody.name = 'ambient-car-bodies';
  ambientBody.castShadow = true;
  const ambientTopMaterial = new THREE.MeshStandardMaterial({
    color: 0x626c78,
    roughness: 0.35,
    metalness: 0.2,
  });
  const ambientTop = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.0, 0.72, 1.6),
    ambientTopMaterial,
    AMBIENT_CAPACITY,
  );
  ambientTop.name = 'ambient-car-tops';
  const headlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff2c8,
    transparent: true,
    opacity: 0,
  });
  const headlight = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.5, 0.18, 0.1),
    headlightMaterial,
    AMBIENT_CAPACITY,
  );
  headlight.name = 'ambient-car-headlights';
  group.add(ambientBody, ambientTop, headlight);
  disposables.push(
    ambientBody.geometry,
    ambientBodyMaterial,
    ambientTop.geometry,
    ambientTopMaterial,
    headlight.geometry,
    headlightMaterial,
  );

  // ---------------------------------------------------------- pedestrians
  const bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const pedestrianBody = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.24, 0.9, 3, 8),
    bodyMaterial,
    PEDESTRIAN_CAPACITY,
  );
  pedestrianBody.name = 'pedestrian-bodies';
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xc9a688, roughness: 0.8 });
  const pedestrianHead = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.17, 8, 6),
    headMaterial,
    PEDESTRIAN_CAPACITY,
  );
  pedestrianHead.name = 'pedestrian-heads';
  group.add(pedestrianBody, pedestrianHead);
  disposables.push(pedestrianBody.geometry, bodyMaterial, pedestrianHead.geometry, headMaterial);

  // Convoy motion smoothing state (visual pacing only; the semantic
  // position is the pure world derivation).
  const convoyTarget = new THREE.Vector3();
  let convoyHeadingTarget = 0;
  let convoyActive = false;

  return {
    group,
    setSemantic(convoy, couriers): void {
      convoyActive = convoy !== null;
      if (convoy) {
        const y = terrainHeight(convoy.position.x, convoy.position.z);
        convoyTarget.set(convoy.position.x, y + 0.15, convoy.position.z);
        convoyHeadingTarget = convoy.heading;
        if (!convoyGroup.visible) {
          convoyGroup.position.copy(convoyTarget);
          convoyGroup.rotation.y = convoy.heading;
        }
        convoyGroup.visible = true;
      } else {
        convoyGroup.visible = false;
      }
      const count = Math.min(couriers.length, COURIER_CAPACITY);
      for (let i = 0; i < count; i++) {
        const courier = couriers[i]!;
        const y = terrainHeight(courier.position.x, courier.position.z);
        setInstance(
          courierBody,
          i,
          courier.position.x,
          y + 0.95,
          courier.position.z,
          courier.heading,
          COURIER_COLOR,
        );
        setInstance(
          courierLight,
          i,
          courier.position.x,
          y + 1.95,
          courier.position.z,
          courier.heading,
        );
      }
      courierBody.count = count;
      courierLight.count = count;
      courierBody.instanceMatrix.needsUpdate = true;
      courierLight.instanceMatrix.needsUpdate = true;
      if (courierBody.instanceColor) courierBody.instanceColor.needsUpdate = true;
    },
    update(dt, ambient, pedestrians, reducedMotion): void {
      // Smooth the convoy toward its semantic position.
      if (convoyGroup.visible && convoyActive) {
        if (reducedMotion) {
          convoyGroup.position.copy(convoyTarget);
          convoyGroup.rotation.y = convoyHeadingTarget;
        } else {
          convoyGroup.position.lerp(convoyTarget, Math.min(1, dt * 2.2));
          let deltaHeading = convoyHeadingTarget - convoyGroup.rotation.y;
          while (deltaHeading > Math.PI) deltaHeading -= Math.PI * 2;
          while (deltaHeading < -Math.PI) deltaHeading += Math.PI * 2;
          convoyGroup.rotation.y += deltaHeading * Math.min(1, dt * 3);
        }
      }
      const carCount = Math.min(ambient.length, AMBIENT_CAPACITY);
      for (let i = 0; i < carCount; i++) {
        const car = ambient[i]!;
        const y = terrainHeight(car.position.x, car.position.z);
        const color = AMBIENT_COLORS[i % AMBIENT_COLORS.length]!;
        setInstance(ambientBody, i, car.position.x, y + 0.62, car.position.z, car.heading, color);
        setInstance(
          ambientTop,
          i,
          car.position.x - Math.sin(car.heading) * 0.25,
          y + 1.5,
          car.position.z - Math.cos(car.heading) * 0.25,
          car.heading,
        );
        setInstance(
          headlight,
          i,
          car.position.x + Math.sin(car.heading) * 2.0,
          y + 0.7,
          car.position.z + Math.cos(car.heading) * 2.0,
          car.heading,
        );
      }
      ambientBody.count = carCount;
      ambientTop.count = carCount;
      headlight.count = carCount;
      ambientBody.instanceMatrix.needsUpdate = true;
      ambientTop.instanceMatrix.needsUpdate = true;
      headlight.instanceMatrix.needsUpdate = true;
      if (ambientBody.instanceColor) ambientBody.instanceColor.needsUpdate = true;

      const pedCount = Math.min(pedestrians.length, PEDESTRIAN_CAPACITY);
      for (let i = 0; i < pedCount; i++) {
        const pedestrian = pedestrians[i]!;
        const y = terrainHeight(pedestrian.position.x, pedestrian.position.z);
        const color = PEDESTRIAN_COLORS[i % PEDESTRIAN_COLORS.length]!;
        setInstance(
          pedestrianBody,
          i,
          pedestrian.position.x,
          y + 0.8,
          pedestrian.position.z,
          pedestrian.heading,
          color,
        );
        setInstance(
          pedestrianHead,
          i,
          pedestrian.position.x,
          y + 1.62,
          pedestrian.position.z,
          pedestrian.heading,
        );
      }
      pedestrianBody.count = pedCount;
      pedestrianHead.count = pedCount;
      pedestrianBody.instanceMatrix.needsUpdate = true;
      pedestrianHead.instanceMatrix.needsUpdate = true;
      if (pedestrianBody.instanceColor) pedestrianBody.instanceColor.needsUpdate = true;
    },
    applyTimeOfDay(time): void {
      headlightMaterial.opacity = time === 'night' ? 0.95 : time === 'golden' ? 0.5 : 0;
    },
    dispose(): void {
      for (const item of disposables) item.dispose();
      courierBody.dispose();
      courierLight.dispose();
      ambientBody.dispose();
      ambientTop.dispose();
      headlight.dispose();
      pedestrianBody.dispose();
      pedestrianHead.dispose();
    },
  };
}
