import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { canvasTexture, shadows } from './util.js';

const lathe = (pts: [number, number][], seg = 40): LatheGeometry =>
  new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg);

// ---- shared materials (created once, reused by every prop)
let shared: {
  ceramic: MeshStandardMaterial;
  coffee: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  water: MeshStandardMaterial;
  blob: MeshBasicMaterial;
} | null = null;

function mats() {
  if (shared) return shared;
  const crema: CanvasTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#6b3f22');
    g.addColorStop(0.55, '#4a2a15');
    g.addColorStop(0.9, '#2a140a');
    g.addColorStop(1, '#1b0c05');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(210,160,110,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 26, 0.4, 4.2);
    ctx.stroke();
  });
  const blobTex = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  shared = {
    ceramic: new MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.22, metalness: 0, side: DoubleSide }),
    coffee: new MeshStandardMaterial({ color: 0xffffff, map: crema, roughness: 0.06, metalness: 0 }),
    steel: new MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.25, metalness: 0.95 }),
    // glass only *adds* reflections on top of what is behind it, so it never turns milky
    glass: new MeshStandardMaterial({
      color: 0x000000,
      roughness: 0.02,
      metalness: 0,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      envMapIntensity: 3.2,
      depthWrite: false,
    }),
    water: new MeshStandardMaterial({
      color: 0xa9cfe0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
    blob: new MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  };
  return shared;
}

/** Soft dark disc that fakes contact shadow / ambient occlusion on a surface. */
export function blobShadow(radius: number, strength = 1, parent?: Group): Mesh {
  const m = new Mesh(new PlaneGeometry(radius * 2, radius * 2), mats().blob);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.0008;
  m.renderOrder = 2;
  m.scale.setScalar(strength > 1 ? strength : 1);
  parent?.add(m);
  return m;
}

/** Espresso cup on a saucer with a spoon. Origin: centre of the saucer, on the table. */
export function createCoffeeCup(opts: { fill?: number; spoon?: boolean; angle?: number } = {}): Group {
  const { ceramic, coffee, steel } = mats();
  const fill = opts.fill ?? 0.8;
  const g = new Group();
  // saucer
  const saucer = new Mesh(
    lathe([
      [0, 0.0],
      [0.032, 0.0],
      [0.04, 0.003],
      [0.07, 0.011],
      [0.0745, 0.0135],
      [0.0725, 0.0138],
      [0.068, 0.0125],
      [0.034, 0.0055],
      [0, 0.0055],
    ]),
    ceramic,
  );
  g.add(saucer);
  const well = new Mesh(new CircleGeometry(0.036, 32), ceramic);
  well.rotation.x = -Math.PI / 2;
  well.position.y = 0.0057;
  g.add(well);
  // cup body (outer + rim + inner)
  const cup = new Mesh(
    lathe([
      [0, 0.0055],
      [0.022, 0.0055],
      [0.026, 0.009],
      [0.03, 0.02],
      [0.037, 0.045],
      [0.044, 0.072],
      [0.0452, 0.0745],
      [0.0438, 0.0752],
      [0.0422, 0.0735],
      [0.0355, 0.045],
      [0.028, 0.02],
      [0.014, 0.012],
      [0, 0.011],
    ]),
    ceramic,
  );
  g.add(cup);
  // coffee surface sits below the rim
  const level = 0.04 + fill * 0.028;
  const r = 0.0355 + ((level - 0.045) / (0.0735 - 0.045)) * (0.0422 - 0.0355) - 0.0015;
  const surf = new Mesh(new CircleGeometry(r, 36), coffee);
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = level;
  g.add(surf);
  // handle
  const handle = new Mesh(new TorusGeometry(0.019, 0.0045, 10, 22, Math.PI * 1.15), ceramic);
  handle.rotation.z = -Math.PI * 0.58;
  handle.position.set(0.048, 0.046, 0);
  g.add(handle);
  if (opts.spoon !== false) {
    const spoon = new Group();
    const stem = new Mesh(new CylinderGeometry(0.0021, 0.0017, 0.115, 8), steel);
    stem.rotation.z = Math.PI / 2;
    spoon.add(stem);
    const bowl = new Mesh(new SphereGeometry(0.009, 14, 10), steel);
    bowl.scale.set(1.25, 0.28, 0.85);
    bowl.position.x = -0.06;
    spoon.add(bowl);
    spoon.scale.setScalar(0.8);
    spoon.position.set(0.0, 0.0165, 0.028);
    spoon.rotation.y = 0.35;
    g.add(spoon);
  }
  g.rotation.y = opts.angle ?? 0;
  g.add(blobShadow(0.095, 1));
  return shadows(g, true, true);
}

/** Drinking glass with thick base and water. Origin: base on the table. */
export function createWaterGlass(opts: { r?: number; h?: number; level?: number } = {}): Group {
  const { glass, water } = mats();
  const r = opts.r ?? 0.034;
  const h = opts.h ?? 0.095;
  const level = opts.level ?? 0.72;
  const g = new Group();
  const body = new Mesh(
    lathe([
      [0, 0],
      [r * 0.88, 0],
      [r * 0.92, 0.003],
      [r, 0.012],
      [r * 1.12, h],
      [r * 1.1, h + 0.001],
      [r * 1.04, h - 0.001],
      [r * 0.95, 0.018],
      [r * 0.5, 0.0155],
      [0, 0.0155],
    ], 32),
    glass,
  );
  body.renderOrder = 4;
  g.add(body);
  const wh = (h - 0.02) * level;
  const rw = r * (0.95 + 0.17 * ((wh + 0.0155) / h));
  const w = new Mesh(new CylinderGeometry(rw * 0.99, r * 0.93, wh, 32), water);
  w.position.y = 0.0155 + wh / 2;
  w.renderOrder = 3;
  g.add(w);
  g.add(blobShadow(r * 2.4, 1));
  return g;
}

/** Water carafe with a neck and a lid-less mouth. */
export function createCarafe(): Group {
  const { glass, water } = mats();
  const g = new Group();
  const body = new Mesh(
    lathe([
      [0, 0],
      [0.048, 0],
      [0.056, 0.01],
      [0.058, 0.07],
      [0.05, 0.13],
      [0.028, 0.17],
      [0.026, 0.215],
      [0.034, 0.235],
      [0.032, 0.236],
      [0.0245, 0.215],
      [0.0255, 0.17],
      [0.046, 0.13],
      [0.054, 0.07],
      [0.052, 0.014],
      [0, 0.014],
    ], 36),
    glass,
  );
  body.renderOrder = 4;
  g.add(body);
  const w = new Mesh(new CylinderGeometry(0.049, 0.05, 0.1, 32), water);
  w.position.y = 0.065;
  w.renderOrder = 3;
  g.add(w);
  g.add(blobShadow(0.14, 1));
  return g;
}
export type { Material };
