import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';

/** Deterministic PRNG so the room looks identical on every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  repeat?: [number, number],
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  draw(ctx, w, h);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

export function roundedRect(w: number, d: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + d - r);
  s.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + d);
  s.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: number;
  ei?: number;
  opacity?: number;
}

/** Tracks every material created for an object so it can be faded as a whole. */
export class MaterialBag {
  readonly list: { mat: Material; base: number }[] = [];
  make(color: number, o: MatOpts = {}): MeshStandardMaterial {
    const m = new MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.7,
      metalness: o.metal ?? 0,
    });
    if (o.emissive !== undefined) {
      m.emissive.setHex(o.emissive);
      m.emissiveIntensity = o.ei ?? 1;
    }
    if (o.opacity !== undefined) {
      m.transparent = true;
      m.opacity = o.opacity;
    }
    this.track(m, o.opacity ?? 1);
    return m;
  }
  track(mat: Material, base = 1): void {
    this.list.push({ mat, base });
  }
  /** occ in [0,1]; 1 restores the original look. */
  setFade(occ: number): void {
    const done = occ >= 1;
    for (const { mat, base } of this.list) {
      mat.opacity = base * occ;
      mat.transparent = base < 1 || !done;
      mat.depthWrite = done || base >= 1 ? true : mat.depthWrite;
    }
  }
}

const unitSphere = new SphereGeometry(1, 28, 18);
const unitBox = new BoxGeometry(1, 1, 1);
const unitCyl = new CylinderGeometry(1, 1, 1, 24, 1);

export function sphere(
  mat: Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
  parent?: Object3D,
): Mesh {
  const m = new Mesh(unitSphere, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

export function box(
  mat: Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  parent?: Object3D,
): Mesh {
  const m = new Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

export function cyl(
  mat: Material,
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  parent?: Object3D,
): Mesh {
  const m = new Mesh(unitCyl, mat);
  m.scale.set(r, h, r);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

export function mesh(
  geo: BufferGeometry,
  mat: Material,
  x = 0,
  y = 0,
  z = 0,
  parent?: Object3D,
): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

export function shadows<T extends Object3D>(
  root: T,
  cast = true,
  receive = true,
): T {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return root;
}

const Y = new Vector3(0, 1, 0);
const tmpDir = new Vector3();

/** A tapered cylinder stretched between two points (limbs, legs, arms). */
export class Limb {
  readonly mesh: Mesh;
  constructor(mat: Material, rTop: number, rBottom: number, parent: Group) {
    this.mesh = new Mesh(new CylinderGeometry(rTop, rBottom, 1, 18, 1), mat);
    parent.add(this.mesh);
  }
  set(a: Vector3, b: Vector3): void {
    tmpDir.subVectors(b, a);
    const len = tmpDir.length() || 1e-4;
    this.mesh.position.addVectors(a, b).multiplyScalar(0.5);
    this.mesh.quaternion.setFromUnitVectors(Y, tmpDir.divideScalar(len));
    this.mesh.scale.set(1, len, 1);
  }
}

const ikDir = new Vector3();
const ikPole = new Vector3();

/** Two-bone IK: writes the elbow (or knee) position into `out`. */
export function ik2(
  s: Vector3,
  h: Vector3,
  l1: number,
  l2: number,
  pole: Vector3,
  out: Vector3,
): Vector3 {
  ikDir.subVectors(h, s);
  let d = ikDir.length();
  const maxD = l1 + l2 - 1e-3;
  const minD = Math.abs(l1 - l2) + 1e-3;
  d = Math.min(Math.max(d, minD), maxD);
  ikDir.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const hh = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  ikPole.copy(pole).addScaledVector(ikDir, -pole.dot(ikDir)).normalize();
  return out.copy(s).addScaledVector(ikDir, a).addScaledVector(ikPole, hh);
}

export function smoothstep(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}
