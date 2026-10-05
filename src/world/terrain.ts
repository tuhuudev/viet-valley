import * as THREE from 'three';
import { createNoise2D } from '../core/noise';
import { WORLD_SIZE, type Heightfield } from './heightfield';
import type { Track } from './track';

const CORRIDOR = 4.5; // half-width of the flat ledge
const BLEND = 9; // blend distance back to natural terrain

const C_SAND = new THREE.Color('#efd6a0');
const C_GRASS = new THREE.Color('#9abf67');
const C_FOREST = new THREE.Color('#4b9062');
const C_ROCK = new THREE.Color('#b09f83');
const C_PEAK = new THREE.Color('#cec3a5');
const C_LEDGE = new THREE.Color('#bbac87');
const C_SEABED = new THREE.Color('#d4c493');
const C_WARM = new THREE.Color('#bdc67b');
const C_COOL = new THREE.Color('#639c88');

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Final terrain height with the railway ledge carved in (only where the track is a cut). */
export const LEDGE_OFFSET = 0.35;

export function createCarvedHeight(hf: Heightfield, track: Track) {
  const ledgeY = track.options.railY - LEDGE_OFFSET;
  return (x: number, z: number): number => {
    const h = hf.height(x, z);
    const { sample, dist } = track.nearest(x, z);
    if (sample.kind !== 'cut' || dist > CORRIDOR + BLEND) return h;
    const w = 1 - smoothstep(CORRIDOR, CORRIDOR + BLEND, dist);
    return h + (ledgeY - h) * w;
  };
}

export function createTerrainMesh(
  height: (x: number, z: number) => number,
  ledgeY: number,
  segments = 176,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const noise = createNoise2D(1975);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);

    // Slope estimate for colouring
    const e = 1.2;
    const dx = height(x + e, z) - height(x - e, z);
    const dz = height(x, z + e) - height(x, z - e);
    const slope = Math.sqrt(dx * dx + dz * dz) / (2 * e);

    const woodland = smoothstep(-0.4, 0.5, noise(x * 0.024, z * 0.024));
    const meadow = noise(x * 0.057 + 20, z * 0.057);
    if (y < 0) c.copy(C_SEABED);
    else if (y < 2.3) c.copy(C_SAND).lerp(C_GRASS, smoothstep(1.1, 2.3, y) * 0.5);
    else {
      c.copy(C_GRASS).lerp(C_FOREST, woodland * 0.7 + smoothstep(35, 95, y) * 0.13);
      c.lerp(C_WARM, Math.max(0, meadow) * 0.25);
      const facing = (dx * 0.8 + dz * 0.6) / Math.max(1, Math.hypot(dx, dz));
      c.lerp(facing > 0 ? C_COOL : C_WARM, Math.abs(facing) * 0.1);
    }
    // Keep the railway ledge warm and grassy between the exposed cuts.
    const nearLedge = Math.abs(y - ledgeY) < 5;
    if (y > 2.3 && !nearLedge) {
      const exposed = smoothstep(0.95, 2, slope);
      c.lerp(C_ROCK, exposed * 0.82);
      c.lerp(C_PEAK, smoothstep(92, 113, y) * 0.6 + exposed * 0.08);
      c.multiplyScalar(0.97 + 0.045 * Math.sin(y * 0.91));
    }
    // Flat ledge colour along the railway
    if (slope < 0.05 && Math.abs(y - ledgeY) < 0.2) c.lerp(C_LEDGE, 0.8);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
