import * as THREE from 'three';
import { SEA_LEVEL, WORLD_SIZE } from './heightfield';

export interface Sea {
  mesh: THREE.Mesh;
  update: (time: number) => void;
}

export function createSea(): Sea {
  const size = WORLD_SIZE * 2.4;
  const geo = new THREE.PlaneGeometry(size, size, 110, 110);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);

  const mat = new THREE.MeshPhongMaterial({
    color: '#2f8fa6',
    specular: '#cfefff',
    shininess: 60,
    flatShading: true,
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = SEA_LEVEL;

  // A flat, far-reaching sea under the animated patch so the horizon never shows an edge.
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 30, WORLD_SIZE * 30).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: '#2f8fa6', specular: '#cfefff', shininess: 60 }),
  );
  far.position.y = -0.45;
  mesh.add(far);

  const update = (time: number) => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      const y =
        0.35 * Math.sin(x * 0.08 + time * 0.9) +
        0.25 * Math.sin(z * 0.11 - time * 1.3) +
        0.12 * Math.sin((x + z) * 0.21 + time * 1.7);
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  update(0);
  return { mesh, update };
}
