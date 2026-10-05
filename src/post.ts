import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const tilt = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 resolution;
      varying vec2 vUv;
      void main() {
        float blur = smoothstep(0.25, 0.53, abs(vUv.y - 0.51)) * 1.4;
        vec2 stepUv = vec2(blur) / resolution;
        vec4 col = texture2D(tDiffuse, vUv) * 0.5;
        col += texture2D(tDiffuse, vUv + vec2(stepUv.x, 0.0)) * 0.125;
        col += texture2D(tDiffuse, vUv - vec2(stepUv.x, 0.0)) * 0.125;
        col += texture2D(tDiffuse, vUv + vec2(0.0, stepUv.y)) * 0.125;
        col += texture2D(tDiffuse, vUv - vec2(0.0, stepUv.y)) * 0.125;
        float vignette = 1.0 - smoothstep(0.25, 0.72, length(vUv - 0.5)) * 0.055;
        gl_FragColor = vec4(col.rgb * vignette, col.a);
      }`,
  });
  composer.addPass(tilt);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize(w: number, h: number) {
      composer.setSize(w, h);
      tilt.uniforms.resolution.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    },
  };
}
