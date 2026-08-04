import { describe, expect, it } from 'vitest';
import { crosswalkTexture, facadePixels, roadPixels, TEXTURE_SIZE } from '../src/textures.js';

/**
 * Facade atlas contracts (W1.7): fully procedural, byte-deterministic,
 * distinct per style, with lit-window emissive data for night.
 */

const STYLES = ['glass', 'panel', 'concrete', 'brick', 'stone', 'industrial'] as const;

describe('facade textures', () => {
  it('generates byte-identical pixels for the same style (W1.7)', () => {
    for (const style of STYLES) {
      const a = facadePixels(style);
      const b = facadePixels(style);
      expect(Buffer.from(a.albedo).equals(Buffer.from(b.albedo)), style).toBe(true);
      expect(Buffer.from(a.emissive).equals(Buffer.from(b.emissive)), style).toBe(true);
    }
  });

  it('produces distinct albedos per style', () => {
    const buffers = STYLES.map((s) => Buffer.from(facadePixels(s).albedo));
    for (let i = 0; i < buffers.length; i++) {
      for (let j = i + 1; j < buffers.length; j++) {
        expect(buffers[i]!.equals(buffers[j]!), `${STYLES[i]} vs ${STYLES[j]}`).toBe(false);
      }
    }
  });

  it('lights a fraction of windows in the emissive map', () => {
    for (const style of STYLES) {
      const { emissive } = facadePixels(style);
      let lit = 0;
      for (let i = 0; i < emissive.length; i += 4) {
        if (emissive[i]! > 40) lit++;
      }
      const fraction = lit / (emissive.length / 4);
      expect(fraction, style).toBeGreaterThan(0.02);
      expect(fraction, style).toBeLessThan(0.75);
    }
  });

  it('uses opaque pixels at the declared size', () => {
    const { albedo, size } = facadePixels('glass');
    expect(size).toBe(TEXTURE_SIZE);
    expect(albedo.length).toBe(size * size * 4);
    for (let i = 3; i < albedo.length; i += 4) {
      expect(albedo[i]).toBe(255);
    }
  });
});

describe('road textures', () => {
  it('is deterministic and differs with and without dashes', () => {
    const a = roadPixels(true);
    const b = roadPixels(true);
    const plain = roadPixels(false);
    expect(Buffer.from(a.albedo).equals(Buffer.from(b.albedo))).toBe(true);
    expect(Buffer.from(a.albedo).equals(Buffer.from(plain.albedo))).toBe(false);
  });

  it('builds a crosswalk texture with light stripes', () => {
    const texture = crosswalkTexture();
    const data = texture.image.data as Uint8Array;
    let bright = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 150) bright++;
    }
    expect(bright / (data.length / 4)).toBeGreaterThan(0.2);
  });
});
