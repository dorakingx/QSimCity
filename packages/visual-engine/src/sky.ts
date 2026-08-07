import * as THREE from 'three';
import { hashString } from '@qsimcity/world';

/**
 * Sky, sun, stars, clouds, and the three lighting presets (spec §3).
 * The dome is a gradient shader with a sun disc; clouds are procedural
 * billboard sprites; every preset drives the same rig. Presets change
 * presentation only — never scientific state (W2.6).
 */

export type TimeOfDay = 'day' | 'golden' | 'night';

export interface LightingPreset {
  readonly skyTop: number;
  readonly skyHorizon: number;
  readonly sunAzimuth: number;
  readonly sunElevation: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  /**
   * Aerial perspective. The city spans roughly 800 units, and fog that
   * started at 470 left almost all of it equally crisp — which is a large
   * part of why the city read as a model on a table rather than as a place
   * with distance in it. Real air takes contrast out of far buildings;
   * bringing the fog in gives the skyline depth without hiding anything a
   * learner needs to read.
   */
  readonly fogColor: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly exposure: number;
  readonly starOpacity: number;
  readonly cloudColor: number;
  readonly cloudOpacity: number;
  readonly sunDiscIntensity: number;
}

export const LIGHTING_PRESETS: Record<TimeOfDay, LightingPreset> = {
  day: {
    skyTop: 0x3f74c9,
    skyHorizon: 0xbcd7ec,
    sunAzimuth: -0.7,
    sunElevation: 0.95,
    sunColor: 0xfff3e0,
    sunIntensity: 2.7,
    hemiSky: 0xc7ddf5,
    hemiGround: 0x8f8a7a,
    hemiIntensity: 0.95,
    fogColor: 0xbcd7ec,
    fogNear: 320,
    fogFar: 1280,
    exposure: 1.0,
    starOpacity: 0,
    cloudColor: 0xffffff,
    cloudOpacity: 0.82,
    sunDiscIntensity: 0.9,
  },
  golden: {
    skyTop: 0x4a5a94,
    skyHorizon: 0xf2a35c,
    sunAzimuth: -2.35,
    sunElevation: 0.14,
    sunColor: 0xffb066,
    sunIntensity: 2.6,
    hemiSky: 0xc79f7e,
    hemiGround: 0x6a6053,
    hemiIntensity: 0.72,
    fogColor: 0xf2a35c,
    fogNear: 300,
    fogFar: 1200,
    exposure: 1.24,
    starOpacity: 0,
    cloudColor: 0xffc9a0,
    cloudOpacity: 0.75,
    sunDiscIntensity: 1.6,
  },
  night: {
    skyTop: 0x060a18,
    skyHorizon: 0x1c2a4a,
    sunAzimuth: 2.2,
    sunElevation: 0.75,
    sunColor: 0xaebcff,
    sunIntensity: 0.38,
    hemiSky: 0x41527e,
    hemiGround: 0x1c202b,
    hemiIntensity: 0.95,
    fogColor: 0x1c2a4a,
    fogNear: 330,
    fogFar: 1300,
    exposure: 1.12,
    starOpacity: 1,
    cloudColor: 0x24304e,
    cloudOpacity: 0.4,
    sunDiscIntensity: 0.35,
  },
};

export function sunDirection(preset: LightingPreset): THREE.Vector3 {
  const cosE = Math.cos(preset.sunElevation);
  return new THREE.Vector3(
    Math.cos(preset.sunAzimuth) * cosE,
    Math.sin(preset.sunElevation),
    Math.sin(preset.sunAzimuth) * cosE,
  ).normalize();
}

const DOME_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunDisc;
varying vec3 vDirection;
void main() {
  float h = clamp(vDirection.y, 0.0, 1.0);
  vec3 sky = mix(horizonColor, topColor, pow(h, 0.6));
  float alignment = clamp(dot(normalize(vDirection), normalize(sunDir)), 0.0, 1.0);
  // Soft halo plus a tight disc.
  float halo = pow(alignment, 24.0) * 0.35;
  float disc = smoothstep(0.9994, 0.9999, alignment);
  sky += sunColor * (halo + disc * 2.0) * sunDisc;
  gl_FragColor = vec4(sky, 1.0);
}
`;

/** Soft round cloud sprite pixels. */
function cloudPixels(seed: number): { size: number; data: Uint8Array } {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  // Five overlapping deterministic lobes make a puffy cumulus silhouette
  // (three lobes under heavy horizontal sprite squash read as a smear).
  const lobes = [0, 1, 2, 3, 4].map((i) => ({
    x: 0.22 + ((hashString(`cloud:${seed}:${i}:x`) & 0xff) / 0xff) * 0.56,
    y: 0.36 + ((hashString(`cloud:${seed}:${i}:y`) & 0xff) / 0xff) * 0.3,
    r: 0.14 + ((hashString(`cloud:${seed}:${i}:r`) & 0xff) / 0xff) * 0.18,
  }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size;
      const fy = y / size;
      let a = 0;
      for (const lobe of lobes) {
        const d = Math.hypot(fx - lobe.x, (fy - lobe.y) * 1.3);
        a = Math.max(a, Math.max(0, 1 - d / lobe.r));
      }
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.min(1, a ** 1.6 * 1.25) * 255);
    }
  }
  return { size, data };
}

export interface SkyRig {
  readonly group: THREE.Group;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  applyPreset(time: TimeOfDay): LightingPreset;
  /** Extra cloud cover in [0,1] for noise weather. */
  setCloudCover(cover: number): void;
  update(dt: number, reducedMotion: boolean): void;
  dispose(): void;
}

const DOME_RADIUS = 2400;

export function buildSky(): SkyRig {
  const group = new THREE.Group();
  group.name = 'sky';

  const domeMaterial = new THREE.ShaderMaterial({
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    uniforms: {
      topColor: { value: new THREE.Color(LIGHTING_PRESETS.day.skyTop) },
      horizonColor: { value: new THREE.Color(LIGHTING_PRESETS.day.skyHorizon) },
      sunDir: { value: sunDirection(LIGHTING_PRESETS.day) },
      sunColor: { value: new THREE.Color(LIGHTING_PRESETS.day.sunColor) },
      sunDisc: { value: LIGHTING_PRESETS.day.sunDiscIntensity },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), domeMaterial);
  dome.name = 'sky-dome';
  dome.renderOrder = -10;
  group.add(dome);

  // Deterministic starfield on the upper dome.
  const starCount = 900;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const t = (i / starCount) * Math.PI * 0.46 + 0.05;
    const r = DOME_RADIUS * 0.96;
    starPositions[i * 3] = Math.cos(a) * Math.sin(t) * r;
    starPositions[i * 3 + 1] = Math.cos(t) * r * 0.85 + 100;
    starPositions[i * 3 + 2] = Math.sin(a) * Math.sin(t) * r;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xc8d4ff,
    size: 3,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.name = 'stars';
  group.add(stars);

  // Cloud billboards drifting slowly across the city.
  const clouds: THREE.Sprite[] = [];
  const cloudTextures: THREE.DataTexture[] = [];
  for (let i = 0; i < 14; i++) {
    const pixels = cloudPixels(i);
    const texture = new THREE.DataTexture(pixels.data, pixels.size, pixels.size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    cloudTextures.push(texture);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.8,
    });
    const sprite = new THREE.Sprite(material);
    const spread = 1500;
    sprite.position.set(
      ((hashString(`cloudpos:${i}:x`) & 0xffff) / 0xffff - 0.5) * spread * 2,
      470 + ((hashString(`cloudpos:${i}:y`) & 0xffff) / 0xffff) * 220,
      ((hashString(`cloudpos:${i}:z`) & 0xffff) / 0xffff - 0.5) * spread * 1.4,
    );
    const scale = 340 + ((hashString(`cloudscale:${i}`) & 0xffff) / 0xffff) * 360;
    sprite.scale.set(scale, scale * 0.52, 1);
    group.add(sprite);
    clouds.push(sprite);
  }

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.name = 'sun';
  const hemi = new THREE.HemisphereLight(0xbdd6f0, 0x8a8574, 0.9);
  hemi.name = 'hemi';
  group.add(sun, sun.target, hemi);

  let baseCloudOpacity = LIGHTING_PRESETS.day.cloudOpacity;
  let cloudCover = 0;

  const applyClouds = (): void => {
    clouds.forEach((cloud, i) => {
      const material = cloud.material;
      // Weather cover thickens and multiplies visible clouds.
      const visibleBase = i < 8 ? 1 : 0;
      const visible = Math.max(visibleBase, cloudCover > (i - 6) / 10 ? 1 : 0);
      material.opacity = baseCloudOpacity * visible * (0.55 + 0.45 * Math.min(1, cloudCover + 0.4));
    });
  };

  return {
    group,
    sun,
    hemi,
    applyPreset(time: TimeOfDay): LightingPreset {
      const preset = LIGHTING_PRESETS[time];
      (domeMaterial.uniforms['topColor']!.value as THREE.Color).setHex(preset.skyTop);
      (domeMaterial.uniforms['horizonColor']!.value as THREE.Color).setHex(preset.skyHorizon);
      (domeMaterial.uniforms['sunDir']!.value as THREE.Vector3).copy(sunDirection(preset));
      (domeMaterial.uniforms['sunColor']!.value as THREE.Color).setHex(preset.sunColor);
      domeMaterial.uniforms['sunDisc']!.value = preset.sunDiscIntensity;
      const direction = sunDirection(preset);
      sun.position.copy(direction.clone().multiplyScalar(900));
      sun.target.position.set(0, 0, 0);
      sun.color.setHex(preset.sunColor);
      sun.intensity = preset.sunIntensity;
      hemi.color.setHex(preset.hemiSky);
      hemi.groundColor.setHex(preset.hemiGround);
      hemi.intensity = preset.hemiIntensity;
      starMaterial.opacity = preset.starOpacity;
      baseCloudOpacity = preset.cloudOpacity;
      for (const cloud of clouds) {
        cloud.material.color.setHex(preset.cloudColor);
      }
      applyClouds();
      return preset;
    },
    setCloudCover(cover: number): void {
      cloudCover = Math.max(0, Math.min(1, cover));
      applyClouds();
    },
    update(dt: number, reducedMotion: boolean): void {
      if (reducedMotion) return;
      for (const [i, cloud] of clouds.entries()) {
        cloud.position.x += dt * (2.2 + (i % 5) * 0.5);
        if (cloud.position.x > 1700) cloud.position.x = -1700;
      }
    },
    dispose(): void {
      dome.geometry.dispose();
      domeMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      for (const cloud of clouds) cloud.material.dispose();
      for (const texture of cloudTextures) texture.dispose();
    },
  };
}
