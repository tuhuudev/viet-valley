import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createClouds } from '../src/env/clouds';
import { createSky, PRESETS } from '../src/env/sky';
import { createHeightfield } from '../src/world/heightfield';
import { createRailway } from '../src/world/railway';
import { createSea } from '../src/world/sea';
import { createCarvedHeight, createTerrainMesh, LEDGE_OFFSET } from '../src/world/terrain';
import { buildTrack } from '../src/world/track';
import { createTrain } from '../src/world/train';
import { createVegetation } from '../src/world/vegetation';

type Drawable = THREE.Mesh | THREE.Points | THREE.Line;

/** No frustum/visibility culling: includes cars temporarily hidden at the wrap. */
function submissionBudget(scene: THREE.Scene) {
  let color = 0;
  let shadowCasters = 0;
  let shadowViews = 0;
  let triangles = 0;
  let shadowTriangles = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.Light && object.castShadow) {
      shadowViews += object instanceof THREE.PointLight ? 6 : 1;
    }
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
    const drawable: Drawable = object;
    const geometry = drawable.geometry;
    const total = geometry.index?.count ?? geometry.getAttribute('position').count;
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    if (instances === 0) return;
    const batches = Array.isArray(drawable.material)
      ? geometry.groups.map((group) => ({ material: (drawable.material as THREE.Material[])[group.materialIndex ?? 0], start: group.start, count: group.count }))
      : [{ material: drawable.material, start: 0, count: total }];
    for (const batch of batches) {
      if (!batch.material) continue;
      const start = Math.max(batch.start, geometry.drawRange.start);
      const end = Math.min(total, batch.start + batch.count, geometry.drawRange.start + geometry.drawRange.count);
      if (end <= start) continue;
      const doublePass = object instanceof THREE.Mesh && batch.material.transparent
        && batch.material.side === THREE.DoubleSide && !batch.material.forceSinglePass;
      const passes = doublePass ? 2 : 1;
      const faces = object instanceof THREE.Mesh ? (end - start) * instances / 3 : 0;
      color += passes;
      triangles += faces * passes;
      if (object.castShadow) {
        shadowCasters++;
        shadowTriangles += faces;
      }
    }
  });
  const shadows = shadowCasters * shadowViews;
  return { color, shadows, post: 2, total: color + shadows + 2, triangles: triangles + shadowTriangles * shadowViews + 2 };
}

describe('procedural scene', () => {
  const seed = 1975;
  const scene = new THREE.Scene();
  const hf = createHeightfield(seed);
  const track = buildTrack(hf);
  const height = createCarvedHeight(hf, track);
  const sea = createSea(hf);
  const railway = createRailway(track, height);
  const train = createTrain(railway.curve, railway.length);
  const clouds = createClouds(seed + 19);
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const hemi = new THREE.HemisphereLight();
  scene.add(createTerrainMesh(height, track.options.railY - LEDGE_OFFSET), sea.mesh,
    railway.group, train.group, createVegetation(seed + 7, height, track), clouds.group, sun, hemi);
  const sky = createSky(scene, sun, hemi);

  it('keeps geometry and instance transforms finite through day, sunset and night', () => {
    const geometries = new Set<THREE.BufferGeometry>();
    for (const hours of PRESETS) {
      sky.hours = hours;
      const { night } = sky.update(scene);
      expect(night).toBeGreaterThanOrEqual(0);
      expect(night).toBeLessThanOrEqual(1);
      expect([sun.intensity, hemi.intensity, ...sun.color.toArray(), ...hemi.color.toArray(),
        ...hemi.groundColor.toArray()].every(Number.isFinite), 'sky lighting').toBe(true);
      train.setNight(night);
      train.update(2);
      sea.update(hours);
      clouds.update(hours);
      scene.updateMatrixWorld(true);
      scene.traverse((object) => {
        expect(object.matrixWorld.elements.every(Number.isFinite), `${object.type} world matrix`).toBe(true);
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          geometries.add(object.geometry);
        }
        if (object instanceof THREE.InstancedMesh) {
          expect(object.instanceMatrix.array.every(Number.isFinite), 'instance matrices').toBe(true);
          if (object.instanceColor) expect(object.instanceColor.array.every(Number.isFinite), 'instance colors').toBe(true);
        }
      });
    }
    for (const geometry of geometries) {
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        expect(Array.from(attribute.array).every(Number.isFinite), `${geometry.type}.${name}`).toBe(true);
      }
      if (geometry.index) {
        const vertices = geometry.getAttribute('position').count;
        expect(geometry.index.array.every((index) => Number.isInteger(index) && index >= 0 && index < vertices), 'valid triangle indices').toBe(true);
      }
    }
  });

  it('stays below the submission budget including shadows and post passes', () => {
    const budget = submissionBudget(scene);
    console.info('Conservative CPU scene budget (no culling):', JSON.stringify(budget));
    expect(budget.total).toBeLessThan(150);
  });

  it('uses one opaque water surface without overlapping shore or horizon planes', () => {
    const surfaces: THREE.Mesh[] = [];
    sea.mesh.traverse((object) => { if (object instanceof THREE.Mesh) surfaces.push(object); });
    expect(surfaces).toHaveLength(1);
    const materials = Array.isArray(sea.mesh.material) ? sea.mesh.material : [sea.mesh.material];
    for (const material of materials) {
      expect(material.transparent).toBe(false);
      expect(material.opacity).toBe(1);
      expect(material.depthWrite).toBe(true);
    }
  });
});
