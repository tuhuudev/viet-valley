import * as THREE from 'three';

export const CAR_LENGTH = 9;
const CAR_GAP = 0.8;
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

function makeCar(body: string, stripe: string, isLoco: boolean, windowMat: THREE.MeshLambertMaterial): THREE.Group {
  const g = new THREE.Group();
  const w = 2.6;
  const h = isLoco ? 3.3 : 3.1;
  const len = CAR_LENGTH;
  const bodyMat = new THREE.MeshLambertMaterial({ color: body });
  const stripeMat = new THREE.MeshLambertMaterial({ color: stripe });
  const roofMat = new THREE.MeshLambertMaterial({ color: '#d9d6cf' });
  const baseMat = new THREE.MeshLambertMaterial({ color: '#2b2b2e' });

  const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.7, len * 0.92), baseMat);
  base.position.y = 0.35;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), bodyMat);
  shell.position.y = 0.7 + h / 2;
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.35, len + 0.02), stripeMat);
  band.position.y = 0.7 + h * 0.3;
  const windows = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.8, len * (isLoco ? 0.25 : 0.86)), windowMat);
  windows.position.y = 0.7 + h * 0.66;
  if (isLoco) windows.position.z = len * 0.36;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.3, len * 0.96), roofMat);
  roof.position.y = 0.7 + h + 0.15;
  g.add(base, shell, band, windows, roof);
  for (const m of [shell, band, roof]) m.castShadow = true;
  return g;
}

export function createTrain(curve: THREE.Curve<THREE.Vector3>, length: number, carriages = 5): Train {
  const group = new THREE.Group();
  const windowMat = new THREE.MeshLambertMaterial({ color: '#cfe4ee', emissive: '#ffd27a', emissiveIntensity: 0 });
  const cars: THREE.Group[] = [makeCar('#c0392b', '#f1c40f', true, windowMat)];
  for (let i = 0; i < carriages; i++) cars.push(makeCar('#2c5d9e', '#f4f1e8', false, windowMat));
  for (const c of cars) group.add(c);

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
    distance: length * 0.18,
    speed: 7,
    update(dt) {
      train.distance = THREE.MathUtils.euclideanModulo(train.distance + train.speed * dt, length);
      cars.forEach((car, i) => {
        const center = train.distance - i * (CAR_LENGTH + CAR_GAP);
        const uf = pointAt(center + CAR_LENGTH * 0.4, front);
        const ub = pointAt(center - CAR_LENGTH * 0.4, back);
        // A car straddling the wrap point is inside the end tunnels — just hide it.
        car.visible = uf > ub;
        if (!car.visible) return;
        car.position.copy(front).add(back).multiplyScalar(0.5);
        car.position.y += RAIL_TOP + BODY_LIFT - 0.7;
        car.lookAt(front.x, car.position.y, front.z);
      });
    },
    setNight(k) {
      windowMat.emissiveIntensity = k * 1.4;
    },
  };
  train.update(0);
  return train;
}
