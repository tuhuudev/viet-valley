import { createNoise2D, fbm } from '../core/noise';

/**
 * World layout: x runs along the coast, the sea is towards +z, the mountain
 * rises towards -z. World units are roughly metres / 4.
 */
export const WORLD_SIZE = 420;
export const HALF = WORLD_SIZE / 2;
export const SEA_LEVEL = 0;
export const MAX_HEIGHT = 95;
export const SEA_FLOOR = -14;
/** Width of the border band where land fades into the sea. */
export const EDGE_FADE = 45;

export type HeightFn = (x: number, z: number) => number;

export interface Heightfield {
  /** Raw terrain height before the railway corridor is carved in. */
  height: HeightFn;
  /** z of the shoreline at a given x (land is at z < coast). */
  coastZ: (x: number) => number;
}

export function createHeightfield(seed: number): Heightfield {
  const n1 = createNoise2D(seed);
  const n2 = createNoise2D(seed + 101);

  // Wavy coastline: headlands (spurs) and bays — spurs give tunnels, bays give bridges.
  const coastZ = (x: number): number =>
    40 + 26 * Math.sin(x * 0.021 + 0.6) + 10 * Math.sin(x * 0.053 + 2.1) + 6 * n1(x * 0.01, 3.7);

  const core: HeightFn = (x, z) => {
    const inland = coastZ(x) - z; // > 0 on land
    if (inland < 0) {
      // Underwater shelf
      return Math.max(SEA_FLOOR, inland * 0.35 - 0.6);
    }
    const rise = 1 - Math.exp(-inland / 70);
    const ridge = MAX_HEIGHT * Math.pow(rise, 1.15);
    const detailWeight = Math.min(1, inland / 25);
    const detail = 16 * fbm(n2, x * 0.012, z * 0.012, 5) * detailWeight;
    const beach = inland < 4 ? (inland / 4) * 1.2 : 1.2;
    return Math.max(beach, ridge + detail);
  };

  // Taper the land into the sea near the world border so it reads as a headland, not a slab.
  const height: HeightFn = (x, z) => {
    const h = core(x, z);
    const edge = Math.min(HALF - Math.abs(x), HALF - Math.abs(z));
    const t = Math.min(1, Math.max(0, edge / EDGE_FADE));
    const k = t * t * (3 - 2 * t);
    return SEA_FLOOR + (h - SEA_FLOOR) * k;
  };

  return { height, coastZ };
}
