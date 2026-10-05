import * as THREE from 'three';
import './style.css';
import { CAMERA_MODES, createCameraRig } from './cameras';
import { PRESETS, createSky } from './env/sky';
import { createHud } from './ui/hud';
import { createHeightfield } from './world/heightfield';
import { createRailway } from './world/railway';
import { createSea } from './world/sea';
import { LEDGE_OFFSET, createCarvedHeight, createTerrainMesh } from './world/terrain';
import { buildTrack } from './world/track';
import { createTrain } from './world/train';
import { createVegetation } from './world/vegetation';

const SEED = 1975;
const HOURS_PER_SECOND = 1 / 25;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// World
const hf = createHeightfield(SEED);
const track = buildTrack(hf);
const height = createCarvedHeight(hf, track);
scene.add(createTerrainMesh(height, track.options.railY - LEDGE_OFFSET));
const sea = createSea();
scene.add(sea.mesh);
const railway = createRailway(track, height);
scene.add(railway.group);
scene.add(createVegetation(SEED + 7, height, track));
const train = createTrain(railway.curve, railway.length);
scene.add(train.group);

// Light + sky
const hemi = new THREE.HemisphereLight('#ffffff', '#5b6b4a', 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -240;
sc.right = 240;
sc.top = 240;
sc.bottom = -240;
sc.near = 10;
sc.far = 900;
sun.shadow.bias = -0.0006;
scene.add(sun);
const sky = createSky(scene, sun, hemi);

// Cameras + HUD
const rig = createCameraRig(canvas, train, height);
let paused = false;
const nextPreset = () => {
  const h = sky.hours % 24;
  sky.hours = PRESETS.find((p) => p > h + 0.01) ?? PRESETS[0];
};
const hud = createHud(document.getElementById('hud') as HTMLElement, {
  onCamera: (m) => {
    rig.setMode(m);
    hud.setCamera(m);
  },
  onNextTime: nextPreset,
  onTogglePause: () => {
    paused = !paused;
  },
});
hud.setCamera(rig.mode);

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const idx = ['1', '2', '3'].indexOf(e.key);
  if (idx >= 0) {
    rig.setMode(CAMERA_MODES[idx]);
    hud.setCamera(CAMERA_MODES[idx]);
  } else if (e.key === 't' || e.key === 'T') nextPreset();
  else if (e.key === ' ') {
    paused = !paused;
    e.preventDefault();
  } else if (e.key === 'h' || e.key === 'H') hud.toggle();
});

const resize = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.resize(w, h);
};
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let elapsed = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused) {
    elapsed += dt;
    sky.hours = (sky.hours + dt * HOURS_PER_SECOND) % 24;
    train.update(dt);
  }
  sea.update(elapsed);
  const { night } = sky.update(scene);
  train.setNight(night);
  rig.update(dt);
  hud.setClock(sky.hours, paused);
  renderer.render(scene, rig.camera);
});

if (import.meta.env.DEV) {
  Object.assign(window, { __vv: { renderer, scene, sky, rig, train, track } });
}
