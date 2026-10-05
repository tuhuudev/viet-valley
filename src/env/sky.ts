import * as THREE from 'three';
import { createRng, range } from '../core/rng';

/** Time-of-day presets (hours) cycled with the T key. */
export const PRESETS = [6, 9.5, 13, 17.6, 19, 22.5];

interface Palette {
  top: THREE.Color;
  bottom: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemiI: number;
}

const KEYS: Array<[number, Palette]> = [
  [0, { top: c('#0b1330'), bottom: c('#1d2a4a'), sun: c('#8fa6ff'), sunI: 0.25, hemiI: 0.35 }],
  [5.5, { top: c('#2a3563'), bottom: c('#f2a37a'), sun: c('#ffb27a'), sunI: 0.6, hemiI: 0.5 }],
  [8, { top: c('#72b8d7'), bottom: c('#c5e1e7'), sun: c('#ffe6b5'), sunI: 2.1, hemiI: 1.0 }],
  [13, { top: c('#65aed5'), bottom: c('#c7e0e8'), sun: c('#fff0cf'), sunI: 2.4, hemiI: 1.05 }],
  [17, { top: c('#5b8fd0'), bottom: c('#ffd2a1'), sun: c('#ffc887'), sunI: 1.4, hemiI: 0.8 }],
  [18.4, { top: c('#3b3f78'), bottom: c('#ff8a5c'), sun: c('#ff9a62'), sunI: 0.8, hemiI: 0.55 }],
  [20, { top: c('#0f1838'), bottom: c('#2c3360'), sun: c('#8fa6ff'), sunI: 0.3, hemiI: 0.38 }],
  [24, { top: c('#0b1330'), bottom: c('#1d2a4a'), sun: c('#8fa6ff'), sunI: 0.25, hemiI: 0.35 }],
];

function c(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

export interface Sky {
  hours: number;
  update: (scene: THREE.Scene) => { night: number };
}

export function createSky(scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight): Sky {
  const uniforms = {
    top: { value: new THREE.Color() },
    bottom: { value: new THREE.Color() },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          float h = smoothstep(-0.08, 0.65, vDir.y);
          vec3 col = mix(bottom, top, h);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  const starRng = createRng(1987);
  const starPositions: number[] = [];
  for (let i = 0; i < 380; i++) {
    const azimuth = range(starRng, 0, Math.PI * 2);
    const elevation = range(starRng, 0.1, 1.5);
    starPositions.push(
      1500 * Math.cos(azimuth) * Math.cos(elevation),
      1500 * Math.sin(elevation),
      1500 * Math.sin(azimuth) * Math.cos(elevation),
    );
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: '#e4edff', size: 1.6, sizeAttenuation: false, transparent: true,
    opacity: 0, fog: false, depthWrite: false,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  const fog = new THREE.Fog('#cfe9f6', 440, 1400);
  scene.fog = fog;
  const ambientWhite = c('#e8f3ff');
  const groundDay = c('#667f87');
  const groundNight = c('#253354');

  const pal: Palette = { top: c('#000'), bottom: c('#000'), sun: c('#000'), sunI: 0, hemiI: 0 };

  const sky: Sky = {
    hours: 13,
    update(sc) {
      const h = THREE.MathUtils.euclideanModulo(sky.hours, 24);
      let i = 0;
      while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
      const [h0, a] = KEYS[i];
      const [h1, b] = KEYS[i + 1];
      const t = (h - h0) / (h1 - h0);
      pal.top.copy(a.top).lerp(b.top, t);
      pal.bottom.copy(a.bottom).lerp(b.bottom, t);
      pal.sun.copy(a.sun).lerp(b.sun, t);
      pal.sunI = a.sunI + (b.sunI - a.sunI) * t;
      pal.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;

      uniforms.top.value.copy(pal.top);
      uniforms.bottom.value.copy(pal.bottom);
      fog.color.copy(pal.bottom);
      fog.near = 440;
      fog.far = 1450;
      sc.background = pal.bottom;

      // Sun rises over the sea (east is +z here), sets behind the mountain.
      const ang = ((h - 6) / 12) * Math.PI;
      const elev = Math.sin(ang);
      const isDay = elev > -0.05;
      const dirAng = isDay ? ang : ang - Math.PI; // the moon takes over at night
      sun.position.set(Math.cos(dirAng) * -260 - 140, Math.max(40, Math.abs(Math.sin(dirAng)) * 280), 180);
      sun.color.copy(pal.sun);
      sun.intensity = pal.sunI;
      hemi.intensity = pal.hemiI;
      hemi.color.copy(pal.top).lerp(ambientWhite, 0.55);

      const night = THREE.MathUtils.clamp(1 - (elev + 0.25) / 0.3, 0, 1);
      hemi.groundColor.copy(groundDay).lerp(groundNight, night);
      starMat.opacity = night * 0.85;
      return { night };
    },
  };
  return sky;
}
