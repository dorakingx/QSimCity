import { CITY_SCALE, type DistrictId } from './districts.js';

/**
 * Landmark anchors and ground clearances — the single source shared by the
 * block subdivider (so local streets never cut through a landmark) and the
 * building generator (so the landmark stands exactly here). District centers
 * sit on the Processing Boulevard, so anchors are placed beside the road.
 */

export interface LandmarkSite {
  /** World anchor of the landmark origin. */
  readonly anchor: readonly [number, number];
  /** Half extents of the ground the landmark needs kept clear. */
  readonly clearHalfW: number;
  readonly clearHalfD: number;
}

const RAW_SITES: Record<DistrictId, LandmarkSite> = {
  'program-port': { anchor: [-162, 50], clearHalfW: 21, clearHalfD: 18 },
  'ir-foundry': { anchor: [-100, -4], clearHalfW: 15, clearHalfD: 11 },
  'layout-exchange': { anchor: [-40, 49], clearHalfW: 15, clearHalfD: 15 },
  'routing-transit': { anchor: [15, -6], clearHalfW: 20, clearHalfD: 14 },
  'translation-refinery': { anchor: [70, 55], clearHalfW: 16, clearHalfD: 14 },
  'optimization-works': { anchor: [70, -5], clearHalfW: 16, clearHalfD: 13 },
  'scheduling-tower': { anchor: [125, 46], clearHalfW: 11, clearHalfD: 11 },
  'qpu-grid': { anchor: [195, -2], clearHalfW: 10, clearHalfD: 13 },
  'noise-atmosphere': { anchor: [195, -55], clearHalfW: 9, clearHalfD: 9 },
  'measurement-harbor': { anchor: [185, 76], clearHalfW: 19, clearHalfD: 14 },
  'classical-control': { anchor: [125, 74], clearHalfW: 14, clearHalfD: 10 },
  observatory: { anchor: [-45, 132], clearHalfW: 25, clearHalfD: 14 },
};

/** Sites with anchors scaled to city scale (clearances stay in meters). */
export const LANDMARK_SITES: Record<DistrictId, LandmarkSite> = Object.fromEntries(
  Object.entries(RAW_SITES).map(([id, site]) => [
    id,
    { ...site, anchor: [site.anchor[0] * CITY_SCALE, site.anchor[1] * CITY_SCALE] as const },
  ]),
) as Record<DistrictId, LandmarkSite>;
