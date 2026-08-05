import * as THREE from 'three';
import { hashString, type FacadeStyle } from '@qsimcity/world';

/**
 * Procedural texture generation (spec §2.3, W1.7). Every texture is built
 * from raw pixel buffers — no canvas 2D, no assets — so generation is
 * byte-deterministic, testable in Node, and identical on every platform.
 *
 * Facade textures tile one "bay": U spans one window bay (~3.2 m), V spans
 * one floor (~3.1 m). Wall geometry scales UVs by real meters, so window
 * density is correct on every building regardless of size.
 */

export interface FacadePixels {
  readonly size: number;
  /** RGBA base color (day albedo). */
  readonly albedo: Uint8Array;
  /** RGBA emissive map: lit windows at night. */
  readonly emissive: Uint8Array;
  readonly roughness: number;
  readonly metalness: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function rgb(hex: number): Rgb {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Deterministic pseudo-noise in [0,1) from integer coordinates. */
function noise2(seed: string, x: number, y: number): number {
  return (hashString(`${seed}:${x}:${y}`) & 0xffff) / 0x10000;
}

interface FacadeSpec {
  readonly wall: Rgb;
  readonly wallVariation: number;
  readonly frame: Rgb;
  readonly glassDay: Rgb;
  readonly glassNight: Rgb;
  /** Window rect inside the bay, as fractions [x0, y0, x1, y1]. */
  readonly window: readonly [number, number, number, number];
  /** Probability that a window is lit at night. */
  readonly litChance: number;
  readonly roughness: number;
  readonly metalness: number;
  /** Horizontal band rows (spandrels) darker than the wall. */
  readonly bandEvery?: number;
}

const SPECS: Record<Exclude<FacadeStyle, 'plain'>, FacadeSpec> = {
  glass: {
    wall: rgb(0xaebfc9),
    wallVariation: 0.05,
    frame: rgb(0x66757e),
    glassDay: rgb(0x9ab2c2),
    glassNight: rgb(0xffd98c),
    window: [0.06, 0.08, 0.94, 0.92],
    litChance: 0.55,
    roughness: 0.3,
    metalness: 0.22,
  },
  panel: {
    wall: rgb(0xb9bcc2),
    wallVariation: 0.08,
    frame: rgb(0x83878e),
    glassDay: rgb(0x6c7f8c),
    glassNight: rgb(0xffe1a0),
    window: [0.16, 0.2, 0.84, 0.82],
    litChance: 0.45,
    roughness: 0.55,
    metalness: 0.15,
  },
  concrete: {
    wall: rgb(0xa9a49b),
    wallVariation: 0.1,
    frame: rgb(0x6f6b63),
    glassDay: rgb(0x5d6a72),
    glassNight: rgb(0xffd98c),
    window: [0.2, 0.24, 0.8, 0.78],
    litChance: 0.4,
    roughness: 0.85,
    metalness: 0.02,
  },
  brick: {
    wall: rgb(0x9c6a52),
    wallVariation: 0.12,
    frame: rgb(0x4f4038),
    glassDay: rgb(0x66707a),
    glassNight: rgb(0xffcf7e),
    window: [0.22, 0.2, 0.78, 0.8],
    litChance: 0.42,
    roughness: 0.9,
    metalness: 0.0,
  },
  stone: {
    wall: rgb(0xc4bba8),
    wallVariation: 0.06,
    frame: rgb(0x7a7264),
    glassDay: rgb(0x5a6873),
    glassNight: rgb(0xffdf9e),
    window: [0.24, 0.12, 0.76, 0.86],
    litChance: 0.38,
    roughness: 0.75,
    metalness: 0.02,
  },
  industrial: {
    wall: rgb(0x8e979e),
    wallVariation: 0.14,
    frame: rgb(0x5a6167),
    glassDay: rgb(0x707d88),
    glassNight: rgb(0xcfe3ff),
    window: [0.08, 0.62, 0.92, 0.9],
    litChance: 0.3,
    roughness: 0.6,
    metalness: 0.18,
    bandEvery: 4,
  },
};

export const TEXTURE_SIZE = 128;

/** Generate the deterministic pixel buffers for one facade style. */
export function facadePixels(style: Exclude<FacadeStyle, 'plain'>): FacadePixels {
  const spec = SPECS[style];
  const size = TEXTURE_SIZE;
  const albedo = new Uint8Array(size * size * 4);
  const emissive = new Uint8Array(size * size * 4);
  const [wx0, wy0, wx1, wy1] = spec.window;
  // A 2x2 grid of window bays per tile gives per-window lighting variety
  // while keeping the repeat subtle.
  const bays = 2;
  const bayPx = size / bays;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const bayX = Math.floor(x / bayPx);
      const bayY = Math.floor(y / bayPx);
      const fx = (x % bayPx) / bayPx;
      const fy = (y % bayPx) / bayPx;
      const inWindow = fx > wx0 && fx < wx1 && fy > wy0 && fy < wy1;
      const grain = (noise2(style, x, y) - 0.5) * 2 * spec.wallVariation;
      let color: Rgb;
      let glow = 0;
      if (inWindow) {
        const frameBand = 0.05;
        const nearFrame =
          fx < wx0 + frameBand ||
          fx > wx1 - frameBand ||
          fy < wy0 + frameBand ||
          fy > wy1 - frameBand;
        if (nearFrame) {
          color = spec.frame;
        } else {
          // Vertical glass gradient reads as sky reflection by day.
          color = mix(spec.glassDay, rgb(0xdfe9f2), (1 - fy) * 0.35 + grain * 0.5);
          const lit = noise2(`${style}:lit`, bayX, bayY) < spec.litChance;
          if (lit) glow = 0.82 + noise2(`${style}:glow`, bayX, bayY) * 0.18;
        }
      } else {
        color = mix(spec.wall, rgb(0x000000), Math.max(0, -grain));
        color = mix(color, rgb(0xffffff), Math.max(0, grain));
        // Brick coursing / cladding seams.
        if (style === 'brick' && y % 6 === 0) color = mix(color, spec.frame, 0.35);
        if (style === 'industrial' && x % 8 === 0) color = mix(color, spec.frame, 0.3);
        if (spec.bandEvery && y % (bayPx / 1) < 3) color = mix(color, spec.frame, 0.5);
        if (style === 'stone' && y % Math.floor(bayPx / 2) === 0) {
          color = mix(color, spec.frame, 0.25);
        }
      }
      albedo[i] = Math.round(color.r);
      albedo[i + 1] = Math.round(color.g);
      albedo[i + 2] = Math.round(color.b);
      albedo[i + 3] = 255;
      const night = spec.glassNight;
      emissive[i] = Math.round(night.r * glow);
      emissive[i + 1] = Math.round(night.g * glow);
      emissive[i + 2] = Math.round(night.b * glow);
      emissive[i + 3] = 255;
    }
  }
  return { size, albedo, emissive, roughness: spec.roughness, metalness: spec.metalness };
}

export interface FacadeTextures {
  readonly map: THREE.DataTexture;
  readonly emissiveMap: THREE.DataTexture;
  readonly roughness: number;
  readonly metalness: number;
}

function toTexture(pixels: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const textureCache = new Map<string, FacadeTextures>();

/** Build (cached) three.js textures for a facade style. */
export function facadeTextures(style: Exclude<FacadeStyle, 'plain'>): FacadeTextures {
  const cached = textureCache.get(style);
  if (cached) return cached;
  const pixels = facadePixels(style);
  const result: FacadeTextures = {
    map: toTexture(pixels.albedo, pixels.size, true),
    emissiveMap: toTexture(pixels.emissive, pixels.size, true),
    roughness: pixels.roughness,
    metalness: pixels.metalness,
  };
  textureCache.set(style, result);
  return result;
}

/** Asphalt texture with a subtle center dash line, tiling along the road. */
export function roadPixels(withDashes: boolean): { size: number; albedo: Uint8Array } {
  const size = 64;
  const albedo = new Uint8Array(size * size * 4);
  const asphalt = rgb(0x26292f);
  const dash = rgb(0xb9bda9);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const grain = (noise2('asphalt', x, y) - 0.5) * 0.16;
      let color = mix(asphalt, rgb(0xffffff), Math.max(0, grain));
      color = mix(color, rgb(0x000000), Math.max(0, -grain));
      // Center dashes: a 2px line down the middle, 60 percent duty cycle.
      if (withDashes && Math.abs(x - size / 2) < 1.2 && y % 16 < 9) {
        color = mix(color, dash, 0.85);
      }
      albedo[i] = Math.round(color.r);
      albedo[i + 1] = Math.round(color.g);
      albedo[i + 2] = Math.round(color.b);
      albedo[i + 3] = 255;
    }
  }
  return { size, albedo };
}

const roadCache = new Map<string, THREE.DataTexture>();

export function roadTexture(withDashes: boolean): THREE.DataTexture {
  const key = withDashes ? 'dash' : 'plain';
  const cached = roadCache.get(key);
  if (cached) return cached;
  const pixels = roadPixels(withDashes);
  const texture = toTexture(pixels.albedo, pixels.size, true);
  roadCache.set(key, texture);
  return texture;
}

/** Crosswalk stripes. */
export function crosswalkTexture(): THREE.DataTexture {
  const cached = roadCache.get('crosswalk');
  if (cached) return cached;
  const size = 64;
  const albedo = new Uint8Array(size * size * 4);
  const asphalt = rgb(0x33363c);
  const paint = rgb(0xd8dcd2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const stripe = y % 16 < 8;
      const wear = noise2('crosswalk', x, y) * 0.25;
      const color = stripe ? mix(paint, asphalt, wear) : asphalt;
      albedo[i] = Math.round(color.r);
      albedo[i + 1] = Math.round(color.g);
      albedo[i + 2] = Math.round(color.b);
      albedo[i + 3] = 255;
    }
  }
  const texture = toTexture(albedo, size, true);
  roadCache.set('crosswalk', texture);
  return texture;
}

/** Dispose all cached textures (test hygiene). */
export function disposeTextureCaches(): void {
  for (const t of textureCache.values()) {
    t.map.dispose();
    t.emissiveMap.dispose();
  }
  textureCache.clear();
  for (const t of roadCache.values()) t.dispose();
  roadCache.clear();
}
