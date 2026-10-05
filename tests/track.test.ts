import { describe, expect, it } from 'vitest';
import { createHeightfield } from '../src/world/heightfield';
import { buildTrack, runs } from '../src/world/track';

const SEED = 1975;

describe('buildTrack', () => {
  const hf = createHeightfield(SEED);
  const track = buildTrack(hf);
  const { samples } = track;

  it('produces finite samples', () => {
    expect(samples.length).toBeGreaterThan(100);
    for (const s of samples) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
      expect(Number.isFinite(s.z)).toBe(true);
    }
  });

  it('is monotonic in x', () => {
    for (let i = 1; i < samples.length; i++) expect(samples[i].x).toBeGreaterThan(samples[i - 1].x);
  });

  it('starts and ends inside tunnels', () => {
    expect(samples[0].kind).toBe('tunnel');
    expect(samples[samples.length - 1].kind).toBe('tunnel');
  });

  it('has an interesting mix of cuts, tunnels and bridges', () => {
    const kinds = new Set(runs(samples).map((r) => r.kind));
    expect(kinds.has('cut')).toBe(true);
    expect(kinds.has('tunnel')).toBe(true);
    expect(kinds.has('bridge')).toBe(true);
  });

  it('keeps curves gentle (max heading change per step)', () => {
    let maxTurn = 0;
    for (let i = 2; i < samples.length; i++) {
      const a = Math.atan2(samples[i - 1].z - samples[i - 2].z, samples[i - 1].x - samples[i - 2].x);
      const b = Math.atan2(samples[i].z - samples[i - 1].z, samples[i].x - samples[i - 1].x);
      maxTurn = Math.max(maxTurn, Math.abs(b - a));
    }
    expect(maxTurn).toBeLessThan(0.35);
  });

  it('stays on land side of the coast', () => {
    for (const s of samples) expect(s.z).toBeLessThan(hf.coastZ(s.x) + 2);
  });

  it('nearest() finds the closest sample', () => {
    const s = samples[60];
    const r = track.nearest(s.x + 0.1, s.z + 0.1);
    expect(r.index).toBe(60);
    expect(r.dist).toBeLessThan(0.2);
  });
});
