import { describe, expect, it } from 'vitest';
import { createHeightfield, HALF, SEA_LEVEL } from '../src/world/heightfield';
import { buildTrack, runs } from '../src/world/track';

describe('default headland', () => {
  const hf = createHeightfield(1975);
  const track = buildTrack(hf);

  it('closes the shore before every edge of the terrain mesh', () => {
    for (let p = -HALF; p <= HALF; p += 2) {
      expect(hf.height(-HALF, p)).toBeLessThan(SEA_LEVEL);
      expect(hf.height(HALF, p)).toBeLessThan(SEA_LEVEL);
      expect(hf.height(p, -HALF)).toBeLessThan(SEA_LEVEL);
      expect(hf.height(p, HALF)).toBeLessThan(SEA_LEVEL);
    }
  });

  it('buries both railway endpoints beneath the tunnel clearance', () => {
    const ends = [track.samples[0], track.samples[track.samples.length - 1]];
    for (const end of ends) {
      expect(hf.height(end.x, end.z) - end.y).toBeGreaterThan(track.options.tunnelClearance);
    }
  });

  it('leaves a real terrain gap under the middle of a bridge span', () => {
    const bridges = runs(track.samples).filter((run) => run.kind === 'bridge');
    expect(bridges.length).toBeGreaterThan(0);
    for (const bridge of bridges) {
      const midpoint = track.samples[Math.floor((bridge.start + bridge.end) / 2)];
      expect(midpoint.y - hf.height(midpoint.x, midpoint.z)).toBeGreaterThan(track.options.bridgeDrop);
    }
  });
});
