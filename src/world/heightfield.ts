import { createNoise2D, fbm } from '../core/noise';

/** Sea is towards +z; the mountain rises towards -z. */
export const WORLD_SIZE = 420;
export const HALF = WORLD_SIZE / 2;
export const SEA_LEVEL = 0;
export const MAX_HEIGHT = 118;
export const SEA_FLOOR = -14;
export const EDGE_FADE = 45;

export type HeightFn = (x: number, z: number) => number;

export interface Heightfield {
  /** Raw terrain height before the railway corridor is carved in. */
  height: HeightFn;
  /** Shoreward search bound for the railway contour. */
  coastZ: (x: number) => number;
}

export function createHeightfield(seed: number): Heightfield {
  const n1 = createNoise2D(seed);
  const n2 = createNoise2D(seed + 101);

  // The western headland curls around a sheltered bay on the eastern side.
  const coastZ = (x: number): number =>
    45 + 27 * Math.cos((x + 62) * 0.018) + 12 * Math.sin(x * 0.054 + 0.7)
    - 23 * Math.exp(-Math.pow((x - 36) / 39, 2)) + 4 * n1(x * 0.012, 3.7);

  const core: HeightFn = (x, z) => {
    const inland = coastZ(x) - z;
    if (inland < 0) return Math.max(SEA_FLOOR, inland * 0.35 - 0.6);
    const rise = 1 - Math.exp(-inland / 34);
    const peak = (px: number, pz: number, rx: number, rz: number) =>
      Math.exp(-Math.pow((x - px) / rx, 2) - Math.pow((z - pz) / rz, 2));
    const ridge = 38 + 77 * peak(-48, -97, 57, 64)
      + 49 * peak(71, -79, 50, 61) + 23 * peak(-135, -48, 40, 60)
      + 28 * peak(144, -78, 42, 65);
    const detailWeight = Math.min(1, inland / 18);
    const detail = 7 * fbm(n2, x * 0.018, z * 0.018, 3) * detailWeight;
    const ravine = 21 * Math.exp(-Math.pow((x - 20) / 9, 2))
      * Math.exp(-Math.pow((z + 2) / 78, 2)) * detailWeight;
    const h = Math.max(0, ridge * rise + detail - ravine);
    // Broad shelves give the mountain the feel of a hand-carved miniature.
    const step = 6;
    const f = h / step - Math.floor(h / step);
    const t = Math.min(1, Math.max(0, (f - 0.16) / 0.68));
    const shelf = Math.floor(h / step) * step + step * t * t * (3 - 2 * t);
    return h + (shelf - h) * 0.55;
  };

  // An oval footprint closes the shore around the back and both tips.
  const height: HeightFn = (x, z) => {
    const h = core(x, z);
    const radius = Math.hypot(x / 207, (z + 38) / 164);
    const scallop = 0.025 * n1(x * 0.021, z * 0.021);
    const t = Math.min(1, Math.max(0, (1 - radius + scallop) / 0.18));
    const k = t * t * (3 - 2 * t);
    return SEA_FLOOR + (h - SEA_FLOOR) * k;
  };

  return { height, coastZ };
}
