import * as THREE from 'three';
import { createRng, range } from '../core/rng';
import { HALF } from './heightfield';
import type { Track } from './track';

/** Instanced trees: tall conifers higher up, round broadleaf trees lower down, palms by the shore. */
export function createVegetation(
  seed: number,
  height: (x: number, z: number) => number,
  track: Track,
  attempts = 9000,
): THREE.Group {
  const rng = createRng(seed);
  const group = new THREE.Group();

  const cone = new THREE.ConeGeometry(1.3, 4.2, 6);
  cone.translate(0, 3.2, 0);
  const round = new THREE.IcosahedronGeometry(1.7, 0);
  round.translate(0, 2.9, 0);
  const palmTop = new THREE.ConeGeometry(2.2, 1.1, 6);
  palmTop.translate(0, 5.2, 0);
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 5.2, 5);
  trunk.translate(0, 2.6, 0);

  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6e5038', flatShading: true });

  type Kind = 'cone' | 'round' | 'palm';
  const placed: Record<Kind, Array<{ m: THREE.Matrix4; c: THREE.Color }>> = { cone: [], round: [], palm: [] };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < attempts; i++) {
    const x = range(rng, -HALF + 4, HALF - 4);
    const z = range(rng, -HALF + 4, HALF - 4);
    const y = height(x, z);
    if (y < 1.4) continue;
    const e = 1.5;
    const slope = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
    if (slope > 1.1) continue;
    if (track.nearest(x, z).dist < 6.5) continue;

    const kind: Kind = y < 3.2 ? 'palm' : y > 38 || rng() < 0.25 ? 'cone' : 'round';
    if (kind === 'palm' && rng() < 0.5) continue;
    const s = range(rng, 0.7, 1.35);
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(s, s, s));
    const hue = kind === 'cone' ? 0.33 : 0.27;
    const c = new THREE.Color().setHSL(hue + range(rng, -0.03, 0.03), 0.45, range(rng, 0.26, 0.38));
    placed[kind].push({ m, c });
  }

  const build = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Array<{ m: THREE.Matrix4; c: THREE.Color }>, color: boolean) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (color) mesh.setColorAt(i, it.c);
    });
    mesh.castShadow = true;
    group.add(mesh);
  };

  build(cone, leafMat, placed.cone, true);
  build(round, leafMat, placed.round, true);
  build(palmTop, leafMat, placed.palm, true);
  build(trunk, trunkMat, [...placed.round, ...placed.palm], false);
  return group;
}
