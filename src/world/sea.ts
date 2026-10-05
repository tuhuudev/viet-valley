import * as THREE from 'three';
import { SEA_LEVEL, WORLD_SIZE, type Heightfield } from './heightfield';

export interface Sea {
  mesh: THREE.Mesh;
  update: (time: number) => void;
}

const MAP_SIZE = WORLD_SIZE + 16;
const MAP_RESOLUTION = 512;
const SHORE_RANGE = 32;
const DEPTH_RANGE = 24;

/** The signed distance follows every shore, including the back and the tips. */
function createShoreMap(hf: Heightfield): THREE.DataTexture {
  const n = MAP_RESOLUTION;
  const step = MAP_SIZE / n;
  const heights = new Float32Array(n * n);
  const distances = new Float32Array(n * n).fill(SHORE_RANGE);

  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      heights[z * n + x] = hf.height(((x + 0.5) / n - 0.5) * MAP_SIZE, ((z + 0.5) / n - 0.5) * MAP_SIZE) - SEA_LEVEL;
    }
  }

  // Interpolate zero crossings before sweeping distances across the shelf.
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const i = z * n + x;
      for (const j of [i - 1, i + 1, i - n, i + n]) {
        if ((heights[i] >= 0) !== (heights[j] >= 0)) {
          distances[i] = Math.min(distances[i], step * Math.abs(heights[i] / (heights[i] - heights[j])));
        }
      }
    }
  }

  const diagonal = step * Math.SQRT2;
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 1; z < n - 1; z++) {
      for (let x = 1; x < n - 1; x++) {
        const i = z * n + x;
        distances[i] = Math.min(distances[i], distances[i - 1] + step, distances[i - n] + step,
          distances[i - n - 1] + diagonal, distances[i - n + 1] + diagonal);
      }
    }
    for (let z = n - 2; z > 0; z--) {
      for (let x = n - 2; x > 0; x--) {
        const i = z * n + x;
        distances[i] = Math.min(distances[i], distances[i + 1] + step, distances[i + n] + step,
          distances[i + n + 1] + diagonal, distances[i + n - 1] + diagonal);
      }
    }
  }

  const pixels = new Uint8Array(n * n * 4);
  for (let i = 0; i < heights.length; i++) {
    const signed = distances[i] * (heights[i] < 0 ? 1 : -1);
    pixels[i * 4] = Math.round(THREE.MathUtils.clamp(-heights[i] / DEPTH_RANGE, 0, 1) * 255);
    pixels[i * 4 + 1] = Math.round((0.5 + signed / (SHORE_RANGE * 2)) * 255);
    pixels[i * 4 + 2] = 0;
    pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, n, n, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createSea(hf: Heightfield): Sea {
  const uniforms = {
    seaTime: { value: 0 },
    shoreMap: { value: createShoreMap(hf) },
    seaMapSize: { value: MAP_SIZE },
    seaShallows: { value: new THREE.Color('#56ceb9') },
    seaCoastal: { value: new THREE.Color('#159eac') },
    seaDeep: { value: new THREE.Color('#176b94') },
    seaFoam: { value: new THREE.Color('#f6f5df') },
  };
  const mat = new THREE.MeshPhongMaterial({
    color: '#ffffff',
    specular: '#86b9bc',
    shininess: 100,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec2 vSeaXZ;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSeaXZ = (modelMatrix * vec4(position, 1.0)).xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D shoreMap;
        uniform float seaTime;
        uniform float seaMapSize;
        uniform vec3 seaShallows;
        uniform vec3 seaCoastal;
        uniform vec3 seaDeep;
        uniform vec3 seaFoam;
        varying vec2 vSeaXZ;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 shoreUv = vSeaXZ / seaMapSize + 0.5;
        vec2 bed = texture2D(shoreMap, shoreUv).rg;
        float depth = bed.r * ${DEPTH_RANGE.toFixed(1)};
        float shore = (bed.g - 0.5) * ${(SHORE_RANGE * 2).toFixed(1)};
        float shelf = smoothstep(0.0, 11.0, shore);
        float deep = smoothstep(5.0, 29.0, shore) * smoothstep(2.0, 12.0, depth);
        vec3 water = mix(seaShallows, seaCoastal, shelf);
        water = mix(water, seaDeep, deep);

        float rippleA = sin(vSeaXZ.x * 0.43 + vSeaXZ.y * 0.17 + seaTime * 0.9);
        float rippleB = sin(vSeaXZ.x * -0.19 + vSeaXZ.y * 0.57 - seaTime * 0.7);
        water *= 1.0 + 0.025 * rippleA * rippleB;

        // Fine, broken glints travel across the sea instead of broad pale patches.
        float glint = sin(vSeaXZ.x * 0.77 + vSeaXZ.y * 1.85 + seaTime * 1.15);
        float glintWidth = max(fwidth(glint), 0.035);
        glint = smoothstep(0.985 - glintWidth, 0.985 + glintWidth, glint);
        glint *= smoothstep(0.78, 0.98, sin(vSeaXZ.x * 0.41 - vSeaXZ.y * 0.26 - seaTime * 0.3));
        glint *= smoothstep(3.0, 8.0, shore) * 0.075;
        water = mix(water, seaFoam, glint);

        float foamWidth = 1.05 + 0.12 * sin(vSeaXZ.x * 0.38 + vSeaXZ.y * 0.32 + seaTime);
        float foam = 1.0 - smoothstep(0.18, foamWidth, shore);
        water = mix(water, seaFoam, foam * 0.93);
        diffuseColor.rgb *= water;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 waterNormal = normalize(vec3(rippleA * 0.018, 1.0, rippleB * 0.022));
        normal = normalize(mat3(viewMatrix) * waterNormal);`);
  };
  mat.customProgramCacheKey = () => 'coastal-water-v2';

  // One opaque surface reaches the horizon; nothing overlaps beneath it.
  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 30, WORLD_SIZE * 30);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = SEA_LEVEL;
  mesh.receiveShadow = true;

  return { mesh, update: (time) => { uniforms.seaTime.value = time; } };
}
