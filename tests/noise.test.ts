import { describe, expect, it } from 'vitest';
import { createNoise2D, fbm } from '../src/core/noise';

describe('createNoise2D', () => {
  it('is deterministic for the same seed', () => {
    const a = createNoise2D(5);
    const b = createNoise2D(5);
    for (let i = 0; i < 50; i++) expect(a(i * 0.37, i * 0.91)).toBe(b(i * 0.37, i * 0.91));
  });

  it('stays roughly in [-1, 1] and is not constant', () => {
    const n = createNoise2D(9);
    let min = Infinity;
    let max = -Infinity;
    for (let x = 0; x < 100; x++) {
      for (let y = 0; y < 100; y++) {
        const v = n(x * 0.13, y * 0.17);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    expect(min).toBeGreaterThanOrEqual(-1.01);
    expect(max).toBeLessThanOrEqual(1.01);
    expect(max - min).toBeGreaterThan(1);
  });

  it('fbm stays in range', () => {
    const n = createNoise2D(3);
    for (let i = 0; i < 1000; i++) {
      const v = fbm(n, i * 0.05, i * 0.07, 5);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.01);
    }
  });
});
