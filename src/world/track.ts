import { HALF, type Heightfield } from './heightfield';

export type SegmentKind = 'cut' | 'tunnel' | 'bridge';

export interface TrackSample {
  x: number;
  y: number;
  z: number;
  kind: SegmentKind;
}

export interface TrackOptions {
  railY: number;
  step: number;
  margin: number;
  /** Terrain this much above the rail → tunnel. */
  tunnelClearance: number;
  /** Terrain this much below the rail → bridge. */
  bridgeDrop: number;
  /** How far inland (−z) the two ends are pulled so they finish inside the mountain. */
  endPull: number;
  endSamples: number;
  smoothPasses: number;
  minSegment: number;
}

export const DEFAULT_TRACK: TrackOptions = {
  railY: 24,
  step: 2,
  margin: 55, // keep the end tunnels inside full-height mountain (see EDGE_FADE)
  tunnelClearance: 7,
  bridgeDrop: 3,
  endPull: 45,
  endSamples: 14,
  smoothPasses: 6,
  minSegment: 4,
};

export interface Track {
  samples: TrackSample[];
  options: TrackOptions;
  /** Nearest sample (by xz distance) to a point. Assumes samples are monotonic in x. */
  nearest: (x: number, z: number) => { sample: TrackSample; index: number; dist: number };
}

/** z where the terrain crosses `y` at column x (bisection from the shore inland). */
function contourZ(hf: Heightfield, x: number, y: number): number {
  let lo = hf.coastZ(x) - 300; // high ground
  let hi = hf.coastZ(x); // shore
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (hf.height(x, mid) > y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function smooth(values: number[], passes: number, radius = 4): number[] {
  let cur = values.slice();
  for (let p = 0; p < passes; p++) {
    const next = cur.slice();
    for (let i = 0; i < cur.length; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.min(cur.length - 1, Math.max(0, i + k));
        sum += cur[j];
        n++;
      }
      next[i] = sum / n;
    }
    cur = next;
  }
  return cur;
}

/** Merge runs shorter than `min` samples into the preceding run to avoid flicker. */
function mergeShortRuns(kinds: SegmentKind[], min: number): SegmentKind[] {
  const out = kinds.slice();
  let start = 0;
  for (let i = 1; i <= out.length; i++) {
    if (i === out.length || out[i] !== out[start]) {
      if (i - start < min && start > 0) {
        for (let k = start; k < i; k++) out[k] = out[start - 1];
      }
      start = i;
    }
  }
  return out;
}

export function buildTrack(hf: Heightfield, opts: TrackOptions = DEFAULT_TRACK): Track {
  const xs: number[] = [];
  for (let x = -HALF + opts.margin; x <= HALF - opts.margin; x += opts.step) xs.push(x);

  const rawZ = xs.map((x) => contourZ(hf, x, opts.railY));
  const z = smooth(rawZ, opts.smoothPasses);

  // Pull both ends into the mountain so the train vanishes into tunnels.
  const n = xs.length;
  for (let i = 0; i < opts.endSamples; i++) {
    const t = 1 - i / opts.endSamples;
    const pull = opts.endPull * t * t;
    z[i] -= pull;
    z[n - 1 - i] -= pull;
  }

  const kinds: SegmentKind[] = xs.map((x, i) => {
    const clearance = hf.height(x, z[i]) - opts.railY;
    if (clearance > opts.tunnelClearance) return 'tunnel';
    if (clearance < -opts.bridgeDrop) return 'bridge';
    return 'cut';
  });
  const merged = mergeShortRuns(kinds, opts.minSegment);
  // Ends are always tunnels so the wrap-around is hidden.
  for (let i = 0; i < 3; i++) {
    merged[i] = 'tunnel';
    merged[n - 1 - i] = 'tunnel';
  }

  const samples: TrackSample[] = xs.map((x, i) => ({ x, y: opts.railY, z: z[i], kind: merged[i] }));

  const nearest = (px: number, pz: number) => {
    const approx = Math.round((px - xs[0]) / opts.step);
    let best = 0;
    let bestD = Infinity;
    const lo = Math.max(0, approx - 30);
    const hi = Math.min(n - 1, approx + 30);
    for (let i = lo; i <= hi; i++) {
      const dx = samples[i].x - px;
      const dz = samples[i].z - pz;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { sample: samples[best], index: best, dist: Math.sqrt(bestD) };
  };

  return { samples, options: opts, nearest };
}

/** Contiguous runs of the same kind, as [startIndex, endIndex] inclusive. */
export function runs(samples: TrackSample[]): Array<{ kind: SegmentKind; start: number; end: number }> {
  const out: Array<{ kind: SegmentKind; start: number; end: number }> = [];
  let start = 0;
  for (let i = 1; i <= samples.length; i++) {
    if (i === samples.length || samples[i].kind !== samples[start].kind) {
      out.push({ kind: samples[start].kind, start, end: i - 1 });
      start = i;
    }
  }
  return out;
}
