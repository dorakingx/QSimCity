import { describe, expect, it } from 'vitest';
import { buildSky, LIGHTING_PRESETS, sunDirection } from '../src/sky.js';

/**
 * Sky rig contracts (W2.1, W2.4 partial): three presets drive the same
 * dome/sun/star/cloud rig; the environment responds to weather cover.
 */

describe('lighting presets', () => {
  it('defines day, golden, and night with sane physical parameters', () => {
    for (const [name, preset] of Object.entries(LIGHTING_PRESETS)) {
      expect(preset.sunIntensity, name).toBeGreaterThan(0);
      expect(preset.fogFar, name).toBeGreaterThan(preset.fogNear);
      expect(preset.exposure, name).toBeGreaterThan(0.5);
      const dir = sunDirection(preset);
      expect(dir.length(), name).toBeCloseTo(1, 5);
      expect(dir.y, name).toBeGreaterThan(0);
    }
    // Golden hour has the lowest sun; night shows stars, day does not.
    expect(LIGHTING_PRESETS.golden.sunElevation).toBeLessThan(LIGHTING_PRESETS.day.sunElevation);
    expect(LIGHTING_PRESETS.night.starOpacity).toBeGreaterThan(0);
    expect(LIGHTING_PRESETS.day.starOpacity).toBe(0);
  });
});

describe('sky rig', () => {
  it('applies presets to sun, hemisphere, and stars', () => {
    const sky = buildSky();
    const day = sky.applyPreset('day');
    expect(sky.sun.intensity).toBe(day.sunIntensity);
    const night = sky.applyPreset('night');
    expect(sky.sun.intensity).toBe(night.sunIntensity);
    expect(sky.hemi.intensity).toBe(night.hemiIntensity);
    const stars = sky.group.getObjectByName('stars');
    expect(stars).toBeDefined();
    sky.dispose();
  });

  it('drifts clouds over time unless reduced motion is set (W3.6)', () => {
    const sky = buildSky();
    sky.applyPreset('day');
    const cloud = sky.group.children.find((c) => c.type === 'Sprite');
    expect(cloud).toBeDefined();
    const before = cloud!.position.x;
    sky.update(1, true);
    expect(cloud!.position.x).toBe(before);
    sky.update(1, false);
    expect(cloud!.position.x).not.toBe(before);
    sky.dispose();
  });

  it('cloud cover thickens the sky for noise weather (W2.5 presentation)', () => {
    const sky = buildSky();
    sky.applyPreset('day');
    const sprites = sky.group.children.filter((c) => c.type === 'Sprite');
    const opacityAt = (): number =>
      sprites.reduce(
        (sum, s) => sum + (s as unknown as { material: { opacity: number } }).material.opacity,
        0,
      );
    sky.setCloudCover(0);
    const clear = opacityAt();
    sky.setCloudCover(1);
    const overcast = opacityAt();
    expect(overcast).toBeGreaterThan(clear);
    sky.dispose();
  });

  it('keeps the sun disc in the dome shader uniforms', () => {
    const sky = buildSky();
    const dome = sky.group.getObjectByName('sky-dome') as unknown as {
      material: { uniforms: Record<string, { value: unknown }> };
    };
    expect(dome.material.uniforms['sunDir']).toBeDefined();
    expect(dome.material.uniforms['sunDisc']).toBeDefined();
    sky.dispose();
  });
});
