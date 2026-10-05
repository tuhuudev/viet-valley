import * as THREE from 'three';
import { createRng, range } from '../core/rng';

export interface Clouds {
  group: THREE.Group;
  update: (time: number) => void;
}

/** Small stacked banks behind the ridge leave the railway in view. */
export function createClouds(seed: number): Clouds {
  const rng = createRng(seed);
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 10, 7);
  const material = new THREE.MeshLambertMaterial({ color: '#fff8e9' });
  const centers = [
    new THREE.Vector3(-124, 116, -143),
    new THREE.Vector3(21, 129, -160),
    new THREE.Vector3(125, 104, -131),
  ];
  const puffs = [
    [-12, 0, 0, 8], [-3, 1, 1, 10], [8, 0, 0, 9], [17, -1, 0, 6],
    [-5, 8, -1, 8], [5, 11, -2, 10], [13, 6, -1, 7],
  ];
  const clouds = new THREE.InstancedMesh(geometry, material, centers.length * puffs.length);
  const transform = new THREE.Object3D();
  let index = 0;
  for (const center of centers) {
    for (const [x, y, z, radius] of puffs) {
      transform.position.copy(center).add(new THREE.Vector3(x, y, z));
      const size = radius * range(rng, 0.9, 1.08);
      transform.scale.set(size * 1.15, size * 0.87, size);
      transform.rotation.set(0, range(rng, 0, Math.PI), 0);
      transform.updateMatrix();
      clouds.setMatrixAt(index++, transform.matrix);
    }
  }
  clouds.instanceMatrix.needsUpdate = true;
  group.add(clouds);

  const mist = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({
    color: '#e6f3ed', transparent: true, opacity: 0.12, depthWrite: false,
  }), 7);
  for (let i = 0; i < 7; i++) {
    transform.position.set(-73 + i * 10, 88 + Math.sin(i * 0.7) * 2, -101);
    transform.scale.set(13, 1.7, 5);
    transform.updateMatrix();
    mist.setMatrixAt(i, transform.matrix);
  }
  mist.instanceMatrix.needsUpdate = true;
  group.add(mist);

  return {
    group,
    update(time) {
      clouds.position.x = Math.sin(time * 0.012) * 9;
      clouds.position.y = Math.sin(time * 0.018) * 1.3;
      mist.position.x = Math.sin(time * 0.024) * 5;
    },
  };
}
