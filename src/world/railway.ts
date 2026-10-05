import * as THREE from 'three';
import { runs, type Track } from './track';

export interface Railway {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  length: number;
}

const UP = new THREE.Vector3(0, 1, 0);

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

  // Ballast bed, rails, and bridge side walls
  group.add(strip(frames, { off: -1.9, dy: -0.05 }, { off: 1.9, dy: -0.05 }, '#8d8173'));
  for (const off of [-0.55, 0.55]) {
    group.add(strip(frames, { off: off - 0.07, dy: 0.2 }, { off: off + 0.07, dy: 0.2 }, '#5b5f66'));
  }
  const bridgeFrames = frames.map((f, i) => ({ ...f, visible: kinds[i] === 'bridge' }));
  for (const off of [-1.9, 1.9]) {
    group.add(strip(bridgeFrames, { off, dy: -0.05 }, { off, dy: -1.3 }, '#c9c2b4'));
    group.add(strip(bridgeFrames, { off, dy: -0.05 }, { off, dy: 0.7 }, '#a33b2f')); // red parapet
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

  // Bridge pillars
  const pillarGeo = new THREE.BoxGeometry(1.6, 1, 1.6);
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#c9c2b4' });
  const pillarIdx = frames.map((_, i) => i).filter((i) => kinds[i] === 'bridge' && i % 9 === 0);
  const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, Math.max(1, pillarIdx.length));
  pillars.count = pillarIdx.length;
  pillarIdx.forEach((fi, k) => {
    const f = frames[fi];
    const top = f.p.y - 1.3;
    const bottom = Math.min(groundHeight(f.p.x, f.p.z), 0) - 2;
    const h = Math.max(0.5, top - bottom);
    m.compose(new THREE.Vector3(f.p.x, bottom + h / 2, f.p.z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1));
    pillars.setMatrixAt(k, m);
  });
  group.add(pillars);

  // Tunnel portals at every tunnel boundary
  const stone = new THREE.MeshLambertMaterial({ color: '#8a8378' });
  const dark = new THREE.MeshBasicMaterial({ color: '#141210' });
  for (const r of runs(samples)) {
    if (r.kind !== 'tunnel') continue;
    const edges: Array<{ idx: number; inward: number }> = [];
    if (r.start > 0) edges.push({ idx: r.start, inward: 1 });
    if (r.end < samples.length - 1) edges.push({ idx: r.end, inward: -1 });
    for (const e of edges) {
      const s = samples[e.idx];
      const prev = samples[Math.max(0, e.idx - e.inward)];
      const dir = new THREE.Vector3(s.x - prev.x, 0, s.z - prev.z).normalize();
      const portal = new THREE.Group();
      const face = new THREE.Mesh(new THREE.BoxGeometry(6.5, 7, 1.4), stone);
      face.position.y = 3.1;
      const hole = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.8, 1.5), dark);
      hole.position.y = 2.3;
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.5, 16), dark);
      arch.rotation.x = Math.PI / 2;
      arch.position.y = 4.7;
      portal.add(face, hole, arch);
      portal.position.set(s.x, s.y - 0.4, s.z);
      portal.lookAt(s.x + dir.x, s.y - 0.4, s.z + dir.z);
      group.add(portal);
    }
  }

  return { group, curve, length };
}
