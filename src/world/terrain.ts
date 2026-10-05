import * as THREE from 'three';
import { WORLD_SIZE, type Heightfield } from './heightfield';
import type { Track } from './track';

const CORRIDOR = 4.5; // half-width of the flat ledge
const BLEND = 9; // blend distance back to natural terrain

const C_SAND = new THREE.Color('#e8d7a5');
const C_GRASS = new THREE.Color('#7fb069');
const C_FOREST = new THREE.Color('#4f8a4b');
const C_ROCK = new THREE.Color('#9a8f80');
const C_PEAK = new THREE.Color('#b9b2a6');
const C_LEDGE = new THREE.Color('#b8a58a');
const C_SEABED = new THREE.Color('#d9c896');

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
  segments = 240,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

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

    if (y < 0) c.copy(C_SEABED);
    else if (y < 1.6) c.copy(C_SAND);
    else if (y < 40) c.copy(C_GRASS).lerp(C_FOREST, smoothstep(6, 30, y));
    else c.copy(C_FOREST).lerp(C_PEAK, smoothstep(55, 90, y));
    if (y > 2) c.lerp(C_ROCK, smoothstep(1.3, 2.4, slope));
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
