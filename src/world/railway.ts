import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { runs, type Track } from './track';

export interface Railway {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  length: number;
}

const UP = new THREE.Vector3(0, 1, 0);

function stonePart(parts: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, color: string): void {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.applyMatrix4(matrix);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  parts.push(g);
  if (g !== geometry) geometry.dispose();
}

function extrude(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }).translate(0, 0, -depth / 2);
}

interface Frame {
  p: THREE.Vector3;
  side: THREE.Vector3;
  visible: boolean;
}

/** Builds a flat or vertical strip between consecutive visible frames. */
function strip(
  frames: Frame[],
  a: { off: number; dy: number },
  b: { off: number; dy: number },
  color: THREE.ColorRepresentation,
): THREE.Mesh {
  const verts: number[] = [];
  const push = (v: THREE.Vector3) => verts.push(v.x, v.y, v.z);
  const at = (f: Frame, s: { off: number; dy: number }) =>
    f.p.clone().addScaledVector(f.side, s.off).add(new THREE.Vector3(0, s.dy, 0));
  for (let i = 1; i < frames.length; i++) {
    const f0 = frames[i - 1];
    const f1 = frames[i];
    if (!f0.visible || !f1.visible) continue;
    const a0 = at(f0, a);
    const b0 = at(f0, b);
    const a1 = at(f1, a);
    const b1 = at(f1, b);
    push(a0); push(b0); push(a1);
    push(b0); push(b1); push(a1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function createRailway(track: Track, groundHeight: (x: number, z: number) => number): Railway {
  const { samples } = track;
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(
    samples.map((s) => new THREE.Vector3(s.x, s.y, s.z)),
    false,
    'centripetal',
  );
  const length = curve.getLength();
  const count = Math.ceil(length);
  const frames: Frame[] = [];
  const kinds: string[] = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, UP).normalize();
    const kind = track.nearest(p.x, p.z).sample.kind;
    kinds.push(kind);
    frames.push({ p, side, visible: kind !== 'tunnel' });
  }

  // Ballast, bright rail heads, and warm stone bridge coping.
  group.add(strip(frames, { off: -1.9, dy: -0.05 }, { off: 1.9, dy: -0.05 }, '#b4a18b'));
  for (const off of [-0.55, 0.55]) {
    group.add(strip(frames, { off: off - 0.07, dy: 0.2 }, { off: off + 0.07, dy: 0.2 }, '#646d72'));
  }
  const bridgeFrames = frames.map((f, i) => ({ ...f, visible: kinds[i] === 'bridge' }));
  for (const off of [-1.9, 1.9]) {
    group.add(strip(bridgeFrames, { off, dy: -0.05 }, { off, dy: -1.3 }, '#c9bfa8'));
    group.add(strip(bridgeFrames, { off, dy: -0.05 }, { off, dy: 0.55 }, '#d6cbb3'));
    group.add(strip(bridgeFrames, { off: off - 0.15, dy: 0.55 }, { off: off + 0.15, dy: 0.55 }, '#ede0c2'));
  }
  group.add(strip(bridgeFrames, { off: -1.9, dy: -1.3 }, { off: 1.9, dy: -1.3 }, '#b3ab9c'));

  // Sleepers (instanced)
  const sleeperGeo = new THREE.BoxGeometry(0.35, 0.14, 2.2);
  const sleeperMat = new THREE.MeshLambertMaterial({ color: '#6b5240' });
  const visibleIdx = frames.map((f, i) => (f.visible ? i : -1)).filter((i) => i >= 0);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, visibleIdx.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  visibleIdx.forEach((fi, k) => {
    const f = frames[fi];
    // Rotate so the box's local z (its 2.2 length) spans across the track
    q.setFromAxisAngle(UP, Math.atan2(f.side.x, f.side.z));
    m.compose(f.p.clone().add(new THREE.Vector3(0, 0.07, 0)), q, s1);
    sleepers.setMatrixAt(k, m);
  });
  group.add(sleepers);

  const masonry: THREE.BufferGeometry[] = [];
  const openings: THREE.BufferGeometry[] = [];
  // Solid spandrels sit over arch openings; piers reach the actual valley floor.
  for (let start = 0; start < frames.length; start++) {
    if (kinds[start] !== 'bridge') continue;
    let end = start;
    while (end + 1 < frames.length && kinds[end + 1] === 'bridge') end++;
    const spans = Math.max(1, Math.round((end - start) / 10));
    for (let span = 0; span < spans; span++) {
      const a = frames[Math.round(start + (end - start) * span / spans)].p;
      const b = frames[Math.round(start + (end - start) * (span + 1) / spans)].p;
      const width = a.distanceTo(b);
      if (width < 1.5) continue;
      const r = Math.max(0.3, (width - 1.65) / 2);
      const spring = -1.45 - r - 0.75;
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -1.1);
      shape.lineTo(width / 2, -1.1);
      shape.lineTo(width / 2, spring);
      for (let j = 0; j <= 14; j++) {
        const angle = Math.PI * j / 14;
        shape.lineTo(r * Math.cos(angle), spring + r * Math.sin(angle));
      }
      shape.lineTo(-width / 2, spring);
      shape.closePath();
      const center = a.clone().add(b).multiplyScalar(0.5);
      const angle = Math.atan2(a.z - b.z, b.x - a.x);
      q.setFromAxisAngle(UP, angle);
      m.compose(center, q, s1);
      stonePart(masonry, extrude(shape, 3.7), m, '#bcae91');
      // Pale voussoirs outline the arch on both faces, with small mortar gaps.
      for (let j = 0; j < 12; j++) {
        const ring = new THREE.Shape();
        const lo = Math.PI * (j + 0.035) / 12;
        const hi = Math.PI * (j + 0.965) / 12;
        const outer = r + 0.48;
        ring.moveTo(r * Math.cos(lo), spring + r * Math.sin(lo));
        ring.lineTo(outer * Math.cos(lo), spring + outer * Math.sin(lo));
        ring.lineTo(outer * Math.cos(hi), spring + outer * Math.sin(hi));
        ring.lineTo(r * Math.cos(hi), spring + r * Math.sin(hi));
        ring.closePath();
        for (const side of [-1, 1]) {
          const geo = extrude(ring, 0.08).translate(0, 0, side * 1.88);
          stonePart(masonry, geo, m, j % 3 === 0 ? '#e1d4b6' : '#d5c6a7');
        }
      }
      for (const p of span === spans - 1 ? [a, b] : [a]) {
        const bottom = groundHeight(p.x, p.z) - 1.2;
        const height = Math.max(0.5, p.y + spring - bottom);
        m.compose(new THREE.Vector3(p.x, bottom + height / 2, p.z), q, s1);
        stonePart(masonry, new THREE.BoxGeometry(1.85, height, 3.7), m, '#baad94');
        m.compose(new THREE.Vector3(p.x, bottom + 0.38, p.z), q, s1);
        stonePart(masonry, new THREE.BoxGeometry(2.55, 0.76, 4.2), m, '#c8bda4');
      }
    }
    start = end;
  }

  // Deep, arched tunnel portals replace the black rectangles pasted on stone.
  for (const r of runs(samples)) {
    if (r.kind !== 'tunnel') continue;
    const edges: Array<{ idx: number; inward: number }> = [];
    if (r.start > 0) edges.push({ idx: r.start, inward: 1 });
    if (r.end < samples.length - 1) edges.push({ idx: r.end, inward: -1 });
    for (const e of edges) {
      const s = samples[e.idx];
      const prev = samples[Math.max(0, e.idx - e.inward)];
      const dir = new THREE.Vector3(s.x - prev.x, 0, s.z - prev.z).normalize();
      q.setFromAxisAngle(UP, Math.atan2(dir.x, dir.z));
      // The first tunnel sample is already buried. Put its mouth on the cut
      // approach and extend the masonry back into the hillside.
      const mouth = new THREE.Vector3(prev.x, s.y - 0.4, prev.z).addScaledVector(dir, -1);
      const depth = Math.hypot(s.x - prev.x, s.z - prev.z) / 2 + 2.2;
      m.compose(mouth, q, s1);
      const rim = new THREE.Shape();
      rim.moveTo(-3.25, -0.3);
      for (let j = 0; j <= 16; j++) {
        const angle = Math.PI - Math.PI * j / 16;
        rim.lineTo(3.25 * Math.cos(angle), 4.15 + 3.25 * Math.sin(angle));
      }
      rim.lineTo(3.25, -0.3);
      rim.lineTo(2.12, -0.3);
      for (let j = 0; j <= 16; j++) {
        const angle = Math.PI * j / 16;
        rim.lineTo(2.12 * Math.cos(angle), 4.15 + 2.12 * Math.sin(angle));
      }
      rim.lineTo(-2.12, -0.3);
      rim.closePath();
      stonePart(masonry, extrude(rim, depth).translate(0, 0, depth / 2 - 0.9), m, '#bdb095');
      stonePart(masonry, new THREE.BoxGeometry(1.0, 0.86, 2.02).translate(0, 6.98, 0), m, '#e5d4af');
      for (const side of [-1, 1]) {
        stonePart(masonry, new THREE.BoxGeometry(1.42, 0.3, 2.05).translate(side * 2.7, 4.05, 0), m, '#d9c9a8');
      }
      const hole = new THREE.Shape();
      hole.moveTo(-2.15, -0.3);
      hole.lineTo(2.15, -0.3);
      for (let j = 0; j <= 16; j++) {
        const angle = Math.PI * j / 16;
        hole.lineTo(2.15 * Math.cos(angle), 4.15 + 2.15 * Math.sin(angle));
      }
      hole.closePath();
      const opening = new THREE.ShapeGeometry(hole).translate(0, 0, 0.55);
      opening.applyMatrix4(m);
      openings.push(opening);
    }
  }

  if (masonry.length) {
    const stone = new THREE.Mesh(mergeGeometries(masonry), new THREE.MeshLambertMaterial({ vertexColors: true }));
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
    for (const geometry of masonry) geometry.dispose();
  }
  if (openings.length) {
    group.add(new THREE.Mesh(mergeGeometries(openings), new THREE.MeshBasicMaterial({ color: '#18252a', side: THREE.DoubleSide })));
    for (const geometry of openings) geometry.dispose();
  }

  return { group, curve, length };
}
