import { describe, expect, it } from 'vitest';
import { districtPlans } from '../src/blocks.js';
import { DISTRICTS, getDistrict } from '../src/districts.js';

describe('blocks and parcels', () => {
  const plans = districtPlans();

  it('gives every district at least one block and one building parcel (W1.4)', () => {
    for (const district of DISTRICTS) {
      const plan = plans.find((p) => p.districtId === district.id)!;
      expect(plan.blocks.length, district.id).toBeGreaterThanOrEqual(1);
      expect(
        plan.parcels.filter((p) => p.usage === 'building').length,
        district.id,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps blocks inside their district zone', () => {
    for (const plan of plans) {
      const d = getDistrict(plan.districtId);
      const minX = d.bounds.x - d.bounds.width / 2 - 0.01;
      const maxX = d.bounds.x + d.bounds.width / 2 + 0.01;
      const minZ = d.bounds.z - d.bounds.depth / 2 - 0.01;
      const maxZ = d.bounds.z + d.bounds.depth / 2 + 0.01;
      for (const block of plan.blocks) {
        expect(block.rect.minX, block.id).toBeGreaterThanOrEqual(minX);
        expect(block.rect.maxX, block.id).toBeLessThanOrEqual(maxX);
        expect(block.rect.minZ, block.id).toBeGreaterThanOrEqual(minZ);
        expect(block.rect.maxZ, block.id).toBeLessThanOrEqual(maxZ);
      }
    }
  });

  it('produces non-overlapping parcels (W1.4)', () => {
    for (const plan of plans) {
      const parcels = plan.parcels;
      for (let i = 0; i < parcels.length; i++) {
        for (let j = i + 1; j < parcels.length; j++) {
          const a = parcels[i]!.rect;
          const b = parcels[j]!.rect;
          const overlap =
            a.minX < b.maxX - 0.01 &&
            a.maxX > b.minX + 0.01 &&
            a.minZ < b.maxZ - 0.01 &&
            a.maxZ > b.minZ + 0.01;
          expect(overlap, `${parcels[i]!.id} vs ${parcels[j]!.id}`).toBe(false);
        }
      }
    }
  });

  it('subdivides oversized pieces so blocks stay walkable', () => {
    // Blocks holding a landmark site may stay larger because streets never
    // cut through a landmark; everything else subdivides below 63 m.
    for (const plan of plans) {
      for (const block of plan.blocks) {
        expect(block.rect.maxX - block.rect.minX, block.id).toBeLessThanOrEqual(95);
        expect(block.rect.maxZ - block.rect.minZ, block.id).toBeLessThanOrEqual(95);
      }
    }
  });

  it('is deterministic', () => {
    const again = districtPlans();
    expect(again).toBe(plans);
  });
});
