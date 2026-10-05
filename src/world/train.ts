import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CAR_LENGTH = 9;
const CAR_GAP = 0.95;
const RAIL_TOP = 0.25;
const BODY_LIFT = 0.75;

export interface Train {
  group: THREE.Group;
  cars: THREE.Group[];
  /** Distance travelled along the track (units). */
  distance: number;
  speed: number;
  update: (dt: number) => void;
  setNight: (k: number) => void;
}

type Parts = THREE.BufferGeometry[];

function part(parts: Parts, geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0): void {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(g);
  if (g !== geometry) geometry.dispose();
}

function box(parts: Parts, color: string, w: number, h: number, d: number, x: number, y: number, z: number): void {
  part(parts, new THREE.BoxGeometry(w, h, d), color, x, y, z);
}

function profile(points: number[][], length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1 }).translate(0, 0, -length / 2);
}

function panel(parts: Parts, color: string, points: number[][]): void {
  const [a, b, c, d] = points;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...c, ...b, ...a, ...d, ...c], 3));
  geometry.computeVertexNormals();
  part(parts, geometry, color);
}

function makeCar(isLoco: boolean, bodyMat: THREE.MeshLambertMaterial, windowMat: THREE.MeshLambertMaterial): THREE.Group {
  const group = new THREE.Group();
  const solid: Parts = [];
  const glass: Parts = [];
  const charcoal = '#26333b';
  const cream = '#eee8d4';
  const blue = '#246f9b';
  const red = '#d53d30';
  const yellow = '#ffd45b';

  box(solid, charcoal, 2.35, 0.46, 8.5, 0, 0.57, 0);
  for (const z of [-2.85, 2.85]) {
    box(solid, '#42515a', 2.3, 0.32, 1.5, 0, 0.22, z);
    for (const axle of [-0.48, 0.48]) {
      const wheels = new THREE.CylinderGeometry(0.33, 0.33, 2.37, 10).rotateZ(Math.PI / 2);
      part(solid, wheels, charcoal, 0, 0.07, z + axle);
    }
  }
  for (const z of [-4.64, 4.64]) box(solid, charcoal, 0.43, 0.24, 0.7, 0, 0.73, z);

  if (isLoco) {
    // A broad shoulder, raked cab face and chamfered nose give the diesel its shape.
    part(solid, profile([[-1.31, 0.85], [1.31, 0.85], [1.31, 2.95], [1.13, 3.24], [-1.13, 3.24], [-1.31, 2.95]], 7.7), red, 0, 0, -0.35);
    part(solid, profile([[-1.3, 2.3], [1.3, 2.3], [1.3, 3.68], [1.08, 4.03], [-1.08, 4.03], [-1.3, 3.68]], 2.85), red, 0, 0, 1.6);
    part(solid, profile([[-1.1, 0], [1.1, 0], [1.36, 0.18], [1.18, 0.37], [-1.18, 0.37], [-1.36, 0.18]], 3.12), cream, 0, 3.99, 1.58);
    const nose = new THREE.BufferGeometry();
    const verts = [
      -1.31, 0.85, 3.0, 1.31, 0.85, 3.0, 1.03, 0.85, 4.45, -1.03, 0.85, 4.45,
      -1.31, 3.66, 3.0, 1.31, 3.66, 3.0, 1.03, 2.57, 4.45, -1.03, 2.57, 4.45,
    ];
    nose.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    nose.setIndex([0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 2, 7, 3, 2, 6, 7, 3, 4, 0, 3, 7, 4, 4, 6, 5, 4, 7, 6, 3, 1, 2, 3, 0, 1]);
    const facetedNose = nose.toNonIndexed();
    facetedNose.computeVertexNormals();
    nose.dispose();
    part(solid, facetedNose, red);
    for (const x of [-1.327, 1.327]) {
      box(solid, yellow, 0.035, 0.39, 7.5, x, 1.65, -0.4);
      box(solid, cream, 0.036, 1.04, 1.61, x, 3.23, 1.65);
      box(glass, '#244955', 0.047, 0.77, 1.33, x, 3.27, 1.67);
      box(solid, charcoal, 0.045, 0.66, 2.85, x, 2.46, -2.1);
      for (let z = -3.35; z < -0.7; z += 0.32) box(solid, '#9f332c', 0.066, 0.68, 0.075, x, 2.46, z);
      box(solid, '#ed7150', 0.065, 0.7, 0.07, x, 1.0, 3.15);
    }
    panel(glass, '#244955', [[-0.96, 3.56, 3.15], [0.96, 3.56, 3.15], [0.84, 2.94, 3.97], [-0.84, 2.94, 3.97]]);
    panel(solid, yellow, [[-1.16, 2.7, 4.3], [1.16, 2.7, 4.3], [1.04, 2.47, 4.48], [-1.04, 2.47, 4.48]]);
    box(solid, red, 0.09, 0.68, 0.1, 0, 3.24, 3.56);
    box(solid, yellow, 2.1, 0.34, 0.035, 0, 1.65, 4.47);
    box(solid, '#3c4951', 2.22, 0.35, 0.3, 0, 0.91, 4.4);
    for (const x of [-0.7, 0.7]) {
      part(solid, new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12).rotateX(Math.PI / 2), charcoal, x, 2.08, 4.46);
      part(glass, new THREE.CircleGeometry(0.145, 12), '#fff0bd', x, 2.08, 4.53);
    }
    box(solid, '#596166', 0.4, 0.4, 0.75, 0, 3.46, -2.3);
    for (const z of [-2.2, -0.65]) part(solid, new THREE.CylinderGeometry(0.63, 0.63, 0.12, 12), charcoal, 0, 3.31, z);
  } else {
    part(solid, profile([[-1.29, 0.78], [1.29, 0.78], [1.36, 1.03], [1.36, 3.32], [1.17, 3.53], [-1.17, 3.53], [-1.36, 3.32], [-1.36, 1.03]], 8.65), blue);
    for (const x of [-1.377, 1.377]) {
      box(solid, cream, 0.033, 1.14, 8.46, x, 2.7, 0);
      box(solid, cream, 0.037, 0.19, 8.52, x, 1.42, 0);
      for (const z of [-3.36, -2.04, -0.72, 0.6, 1.92, 3.24]) {
        box(solid, '#5b8998', 0.046, 0.88, 1.06, x, 2.76, z);
        box(glass, '#244955', 0.057, 0.71, 0.91, x, 2.77, z);
        box(solid, '#cad9d2', 0.067, 0.035, 0.96, x, 2.63, z);
      }
      for (const z of [-4.08, 4.08]) box(solid, '#acd2d4', 0.045, 1.86, 0.065, x, 1.84, z);
    }
    // A faceted barrel roof catches the warm sky without looking like a box.
    part(solid, profile([[-1.43, 3.38], [-1.36, 3.65], [-1.05, 3.86], [-0.55, 3.98], [0.55, 3.98], [1.05, 3.86], [1.36, 3.65], [1.43, 3.38]], 8.88), cream);
    for (const z of [-4.41, 4.41]) {
      box(solid, charcoal, 1.35, 2.4, 0.16, 0, 2.02, z);
      box(solid, '#537680', 0.84, 1.99, 0.19, 0, 2.1, z);
      box(glass, '#244955', 0.57, 0.62, 0.21, 0, 2.57, z);
    }
    for (const z of [-2.1, 2.1]) box(solid, '#c7d0c5', 0.58, 0.12, 0.64, 0, 4.0, z);
  }

  const shell = new THREE.Mesh(mergeGeometries(solid), bodyMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell, new THREE.Mesh(mergeGeometries(glass), windowMat));
  for (const geometry of [...solid, ...glass]) geometry.dispose();
  return group;
}

export function createTrain(curve: THREE.Curve<THREE.Vector3>, length: number, carriages = 5): Train {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const windowMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffd27a', emissiveIntensity: 0, side: THREE.DoubleSide });
  const cars: THREE.Group[] = [makeCar(true, bodyMat, windowMat)];
  if (carriages > 0) {
    const coach = makeCar(false, bodyMat, windowMat);
    for (let i = 0; i < carriages; i++) cars.push(i === 0 ? coach : coach.clone());
  }
  for (const car of cars) group.add(car);

  const front = new THREE.Vector3();
  const back = new THREE.Vector3();
  const pointAt = (d: number, out: THREE.Vector3) => {
    const u = THREE.MathUtils.euclideanModulo(d, length) / length;
    out.copy(curve.getPointAt(u));
    return u;
  };

  const train: Train = {
    group,
    cars,
    distance: length * 0.3,
    speed: 7,
    update(dt) {
      train.distance = THREE.MathUtils.euclideanModulo(train.distance + train.speed * dt, length);
      cars.forEach((car, i) => {
        const center = train.distance - i * (CAR_LENGTH + CAR_GAP);
        const uf = pointAt(center + CAR_LENGTH * 0.4, front);
        const ub = pointAt(center - CAR_LENGTH * 0.4, back);
        car.visible = uf > ub;
        if (!car.visible) return;
        car.position.copy(front).add(back).multiplyScalar(0.5);
        car.position.y += RAIL_TOP + BODY_LIFT - 0.7;
        car.lookAt(front.x, car.position.y, front.z);
      });
    },
    setNight(k) {
      windowMat.emissiveIntensity = k * 0.8;
    },
  };
  train.update(0);
  return train;
}
