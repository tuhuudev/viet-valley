import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Train } from './world/train';

export type CameraMode = 'overview' | 'follow' | 'window';
export const CAMERA_MODES: CameraMode[] = ['overview', 'follow', 'window'];

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  mode: CameraMode;
  setMode: (mode: CameraMode) => void;
  update: (dt: number) => void;
  resize: (w: number, h: number) => void;
}

/** +1 if the object's local +x axis points towards the sea (+z), else -1. */
function seaSide(obj: THREE.Object3D): number {
  const e = obj.matrixWorld.elements;
  return e[2] >= 0 ? 1 : -1; // z component of the local x axis
}

export function createCameraRig(
  dom: HTMLElement,
  train: Train,
  ground: (x: number, z: number) => number,
): CameraRig {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 4000);
  camera.position.set(-60, 130, 330);

  const controls = new OrbitControls(camera, dom);
  controls.target.set(0, 22, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 25;
  controls.maxDistance = 650;
  controls.update();

  const saved = { pos: camera.position.clone(), target: controls.target.clone() };
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  const loco = train.cars[0];
  const seat = train.cars[Math.min(2, train.cars.length - 1)];

  /** Chase position on the sea side of the locomotive, kept above the ground. */
  const followTarget = () => {
    const p = loco.localToWorld(new THREE.Vector3(9 * seaSide(loco), 7, -20));
    p.y = Math.max(p.y, ground(p.x, p.z) + 3, 2);
    return p;
  };

  /** Wider vertical FOV on portrait screens so the whole headland still fits. */
  const applyFov = () => {
    const base = rig.mode === 'overview' ? 50 : rig.mode === 'window' ? 62 : 55;
    camera.fov = camera.aspect < 1 ? base + 22 : base;
    camera.updateProjectionMatrix();
  };

  const rig: CameraRig = {
    camera,
    mode: 'overview',
    setMode(mode) {
      if (rig.mode === mode) return;
      if (rig.mode === 'overview') {
        saved.pos.copy(camera.position);
        saved.target.copy(controls.target);
      }
      rig.mode = mode;
      controls.enabled = mode === 'overview';
      if (mode === 'overview') {
        camera.position.copy(saved.pos);
        controls.target.copy(saved.target);
      } else if (mode === 'follow') {
        camera.position.copy(followTarget());
      }
      applyFov();
    },
    update(dt) {
      if (rig.mode === 'overview') {
        controls.update();
      } else if (rig.mode === 'follow') {
        camera.position.lerp(followTarget(), 1 - Math.exp(-dt * 2.5));
        look.copy(loco.position).add(new THREE.Vector3(0, 2, 0));
        camera.lookAt(look);
      } else {
        // Sit inside a carriage and look out of the sea-side window.
        const side = seaSide(seat);
        camera.position.copy(seat.localToWorld(tmp.set(1.6 * side, 2.6, 0)));
        look.copy(seat.localToWorld(new THREE.Vector3(12 * side, 0.5, 2)));
        camera.lookAt(look);
      }
    },
    resize(w, h) {
      camera.aspect = w / h;
      applyFov();
    },
  };
  return rig;
}
