import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from '../core/noise';
import { createRng, range } from '../core/rng';
import { HALF } from './heightfield';
import type { Track } from './track';

type TreeKind = 'cedar' | 'broadleaf' | 'umbrella';
interface Instance { matrix: THREE.Matrix4; color: THREE.Color }

function foliage(kind: TreeKind): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const crown = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const geo = new THREE.SphereGeometry(1, 7, 5);
    geo.scale(sx, sy, sz);
    geo.translate(x, y, z);
    pieces.push(geo);
  };
  if (kind === 'cedar') {
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.ConeGeometry(1.75 - i * 0.4, 2.9 - i * 0.35, 7);
      geo.translate(0, 2.85 + i * 1.3, 0);
      pieces.push(geo);
    }
  } else if (kind === 'broadleaf') {
    crown(-0.8, 3.25, 0.2, 1.35, 1.25, 1.35);
    crown(0.9, 3.5, -0.1, 1.45, 1.3, 1.35);
    crown(0, 4.65, 0, 1.55, 1.45, 1.5);
  } else {
    crown(-1.1, 3.65, 0, 1.8, 0.85, 1.65);
    crown(1, 3.9, 0.1, 1.7, 0.95, 1.65);
    crown(0, 4.65, -0.15, 1.65, 0.9, 1.5);
  }
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  const position = merged.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const light = 0.83 + Math.min(1, position.getY(i) / 6) * 0.17;
    colors.set([light, light, light * 0.94], i * 3);
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

/** Layered crowns share four draw calls, with open meadows between the groves. */
export function createVegetation(
  seed: number,
  height: (x: number, z: number) => number,
  track: Track,
  attempts = 7600,
): THREE.Group {
  const rng = createRng(seed);
  const woodland = createNoise2D(1975);
  const group = new THREE.Group();
  const leafMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#705541', flatShading: true });
  const placed: Record<TreeKind, Instance[]> = { cedar: [], broadleaf: [], umbrella: [] };
  const stones: Instance[] = [];
  const occupied = new Set<string>();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < attempts; i++) {
    const x = range(rng, -HALF + 6, HALF - 6);
    const z = range(rng, -HALF + 12, 88);
    const y = height(x, z);
    if (y < 3.2 || y > 101) continue;
    const e = 1.5;
    const slope = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
    const distance = track.nearest(x, z).dist;
    if (distance < 7.2) continue;
    const patch = woodland(x * 0.024, z * 0.024);
    if (slope > 1.3 || patch < -0.22 || rng() > 0.48 + patch * 0.48) {
      if (slope > 0.65 && slope < 2.6 && rng() < 0.075 && stones.length < 150) {
        q.setFromAxisAngle(up, rng() * Math.PI * 2);
        const s = range(rng, 0.7, 1.8);
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.25, z), q, new THREE.Vector3(s, s * 0.8, s * 1.2));
        stones.push({ matrix, color: new THREE.Color('#b4ad8d').multiplyScalar(range(rng, 0.85, 1.08)) });
      }
      continue;
    }
    const cell = `${Math.floor(x / 4.2)},${Math.floor(z / 4.2)}`;
    if (occupied.has(cell)) continue;
    occupied.add(cell);

    const pick = rng();
    const kind: TreeKind = y > 67 && pick < 0.7 ? 'cedar' : pick < 0.66 ? 'broadleaf' : 'umbrella';
    const s = range(rng, 0.8, 1.4) * (y > 87 ? 0.8 : 1);
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.16, z), q, new THREE.Vector3(s, s * range(rng, 0.9, 1.2), s));
    const palette = kind === 'cedar' ? ['#397b66', '#46876a', '#538f70']
      : kind === 'broadleaf' ? ['#638e51', '#6f9d54', '#7ba260', '#4f865a']
        : ['#829e57', '#779853', '#689352'];
    const color = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
    color.multiplyScalar(range(rng, 0.92, 1.08));
    placed[kind].push({ matrix, color });
  }

  const build = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Instance[], colored: boolean) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.matrix);
      if (colored) mesh.setColorAt(i, it.color);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  for (const kind of ['cedar', 'broadleaf', 'umbrella'] as const) build(foliage(kind), leafMat, placed[kind], true);
  const trunk = new THREE.CylinderGeometry(0.16, 0.29, 3.1, 5);
  trunk.translate(0, 1.5, 0);
  build(trunk, trunkMat, [...placed.cedar, ...placed.broadleaf, ...placed.umbrella], false);
  build(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), stones, true);
  return group;
}
