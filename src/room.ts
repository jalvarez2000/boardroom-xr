import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Object3D,
  SRGBColorSpace,
  CanvasTexture,
} from 'three';
import {
  blobShadow,
  createCarafe,
  createCoffeeCup,
  createWaterGlass,
} from './props.js';
import {
  box,
  canvasTexture,
  cyl,
  mesh,
  rng,
  roundedRect,
  shadows,
  sphere,
} from './util.js';

export const ROOM = {
  xMin: -3.4,
  xMax: 3.4,
  zMin: -5.6,
  zMax: 2.4,
  height: 2.9,
};

const W_TILES = 7.2 / 0.6;
const D_TILES = 8 / 0.6;

export const TABLE = {
  width: 1.3,
  length: 4.4,
  zFront: -0.25,
  y: 0.75,
};

function std(color: number, rough = 0.8, metal = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function woodFloor(): CanvasTexture {
  return canvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      const r = rng(11);
      const rows = 8;
      const ph = h / rows;
      for (let i = 0; i < rows; i++) {
        let x = -r() * 300;
        while (x < w) {
          const len = 260 + r() * 320;
          const l = 52 + r() * 10;
          ctx.fillStyle = `hsl(${28 + r() * 6}, ${32 + r() * 10}%, ${l - 14 + r() * 8}%)`;
          ctx.fillRect(x, i * ph, len, ph);
          ctx.strokeStyle = 'rgba(40,24,12,0.10)';
          for (let g = 0; g < 14; g++) {
            const y = i * ph + r() * ph;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + len, y + (r() - 0.5) * 3);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x, i * ph, 2, ph);
          x += len;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, i * ph, w, 2);
      }
    },
    [4.25, 5],
  );
}

function walnut(): CanvasTexture {
  return canvasTexture(
    1024,
    512,
    (ctx, w, h) => {
      const r = rng(5);
      ctx.fillStyle = '#4b2e1c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const y = r() * h;
        ctx.strokeStyle = `rgba(${20 + r() * 40},${10 + r() * 20},${5 + r() * 10},${0.1 + r() * 0.25})`;
        ctx.lineWidth = 0.5 + r() * 2.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 64) {
          ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 4 + (r() - 0.5) * 2);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `rgba(150,100,60,${0.04 + r() * 0.08})`;
        ctx.lineWidth = 1 + r() * 2;
        const y = r() * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + (r() - 0.5) * 8);
        ctx.stroke();
      }
    },
    [1, 1],
  );
}

function plaster(): CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#e8e4dc';
      ctx.fillRect(0, 0, w, h);
      const r = rng(3);
      for (let i = 0; i < 4000; i++) {
        const v = 215 + r() * 30;
        ctx.fillStyle = `rgba(${v},${v - 3},${v - 9},0.25)`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
    },
    [4, 2],
  );
}

function carpet(): CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#3b4553';
      ctx.fillRect(0, 0, w, h);
      const r = rng(8);
      for (let i = 0; i < 9000; i++) {
        const v = 40 + r() * 40;
        ctx.fillStyle = `rgba(${v},${v + 8},${v + 20},0.35)`;
        ctx.fillRect(r() * w, r() * h, 1.5, 1.5);
      }
    },
    [6, 10],
  );
}

function ceilingTile(): CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#f2f1ec';
      ctx.fillRect(0, 0, w, h);
      const r = rng(17);
      for (let i = 0; i < 2500; i++) {
        const v = 200 + r() * 40;
        ctx.fillStyle = `rgba(${v},${v},${v - 4},0.35)`;
        ctx.fillRect(r() * w, r() * h, 1, 1.5);
      }
      ctx.strokeStyle = 'rgba(90,90,85,0.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    },
    [W_TILES, D_TILES],
  );
}

function clockFace(): CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f8f7f3';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.lineWidth = i % 3 === 0 ? 7 : 3;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.sin(a) * 100, h / 2 - Math.cos(a) * 100);
      ctx.lineTo(w / 2 + Math.sin(a) * 114, h / 2 - Math.cos(a) * 114);
      ctx.stroke();
    }
    const hand = (a: number, len: number, lw: number) => {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 + Math.sin(a) * len, h / 2 - Math.cos(a) * len);
      ctx.stroke();
    };
    hand((10 + 10 / 60) * (Math.PI / 6), 62, 9);
    hand((10 / 60) * Math.PI * 2, 92, 6);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function cityView(): CanvasTexture {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#6fa8dc');
    sky.addColorStop(0.65, '#cfe3f2');
    sky.addColorStop(1, '#f1ebdd');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const r = rng(21);
    // clouds
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const cx = r() * w;
      const cy = 40 + r() * 140;
      for (let j = 0; j < 6; j++) {
        ctx.beginPath();
        ctx.ellipse(cx + j * 28, cy + (r() - 0.5) * 14, 46, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let layer = 0; layer < 3; layer++) {
      const shade = [188, 150, 110][layer];
      let x = -20;
      while (x < w) {
        const bw = 40 + r() * 70;
        const bh = 110 + r() * 220 - layer * 40;
        ctx.fillStyle = `rgb(${shade - 8},${shade},${shade + 14})`;
        ctx.fillRect(x, h - bh - 30 + layer * 30, bw, bh + 40);
        ctx.fillStyle = `rgba(255,255,255,${0.12 + layer * 0.04})`;
        for (let wy = h - bh - 18 + layer * 30; wy < h - 20; wy += 16) {
          for (let wx = x + 5; wx < x + bw - 8; wx += 12) {
            if (r() > 0.35) ctx.fillRect(wx, wy, 6, 8);
          }
        }
        x += bw + 4 + r() * 8;
      }
    }
  });
}

function slide(): CanvasTexture {
  return canvasTexture(1280, 720, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0f1b33');
    g.addColorStop(1, '#17335c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 62px system-ui, sans-serif';
    ctx.fillText('Board meeting', 70, 120);
    ctx.fillStyle = '#9fb7e0';
    ctx.font = '400 34px system-ui, sans-serif';
    ctx.fillText('Quarterly results · Action plan', 70, 175);
    const bars = [0.45, 0.62, 0.55, 0.78, 0.9];
    const labels = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
    for (let i = 0; i < bars.length; i++) {
      const bx = 110 + i * 130;
      const bh = bars[i] * 360;
      ctx.fillStyle = i === bars.length - 1 ? '#4ade80' : '#3b82f6';
      ctx.fillRect(bx, 640 - bh, 80, bh);
      ctx.fillStyle = '#c7d6f3';
      ctx.font = '500 28px system-ui, sans-serif';
      ctx.fillText(labels[i], bx + 18, 676);
    }
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(150, 520);
    ctx.lineTo(280, 450);
    ctx.lineTo(410, 480);
    ctx.lineTo(540, 380);
    ctx.lineTo(670, 330);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 40px system-ui, sans-serif';
    ctx.fillText('Agenda', 820, 300);
    ctx.fillStyle = '#c7d6f3';
    ctx.font = '400 32px system-ui, sans-serif';
    ['1. Marketing', '2. Sales', '3. R&D', '4. Budget'].forEach((s, i) =>
      ctx.fillText(s, 820, 360 + i * 56),
    );
  });
}

function painting(seed: number): CanvasTexture {
  return canvasTexture(256, 192, (ctx, w, h) => {
    const r = rng(seed);
    ctx.fillStyle = '#efe9dd';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = `hsl(${r() * 360}, 40%, ${45 + r() * 25}%)`;
      ctx.beginPath();
      ctx.arc(r() * w, r() * h, 20 + r() * 60, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function plant(parent: Group, x: number, z: number, scale = 1): void {
  const pot = std(0xe9e5dc, 0.5);
  const leaf = std(0x2f6b3a, 0.65);
  const leaf2 = std(0x3c8247, 0.65);
  const g = new Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  parent.add(g);
  cyl(pot, 0.2, 0.42, 0, 0.21, 0, g);
  cyl(std(0x2b1d12, 1), 0.185, 0.02, 0, 0.42, 0, g);
  const r = rng(Math.floor(x * 100 + z * 10));
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.28;
    const hgt = 0.6 + r() * 0.9;
    const l = sphere(i % 2 ? leaf : leaf2, 0.1, 0.22, 0.04, Math.cos(a) * d, 0.42 + hgt / 2, Math.sin(a) * d, g);
    l.rotation.set((r() - 0.5) * 0.8, a, (r() - 0.5) * 0.8);
    l.scale.set(0.08 + r() * 0.05, hgt / 2, 0.03);
  }
}

function chair(mat: { fabric: Material; plastic: Material; metal: Material }): Group {
  const g = new Group();
  // seat
  const seatGeo = new ExtrudeGeometry(roundedRect(0.5, 0.48, 0.07), {
    depth: 0.08,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 3,
    curveSegments: 6,
  });
  seatGeo.rotateX(-Math.PI / 2);
  mesh(seatGeo, mat.fabric, 0, 0.44, 0, g);
  // backrest
  const backGeo = new ExtrudeGeometry(roundedRect(0.5, 0.56, 0.08), {
    depth: 0.06,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 3,
    curveSegments: 6,
  });
  const back = mesh(backGeo, mat.fabric, 0, 0.85, -0.27, g);
  back.rotation.x = -0.12;
  box(mat.plastic, 0.06, 0.34, 0.05, 0, 0.62, -0.25, g);
  // arms
  for (const sx of [-1, 1]) {
    box(mat.plastic, 0.04, 0.24, 0.04, sx * 0.275, 0.62, -0.08, g);
    box(mat.plastic, 0.06, 0.03, 0.3, sx * 0.275, 0.745, 0.03, g);
  }
  // column + star base
  cyl(mat.metal, 0.03, 0.3, 0, 0.29, 0, g);
  cyl(mat.metal, 0.05, 0.05, 0, 0.455, 0, g);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = box(mat.plastic, 0.05, 0.035, 0.3, Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15, g);
    arm.rotation.y = a;
    cyl(mat.plastic, 0.028, 0.045, Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29, g);
  }
  const cb = blobShadow(0.45, 1);
  cb.position.y = 0.0075;
  g.add(cb);
  return shadows(g, true, true);
}

export interface Room {
  group: Group;
  chairs: Group[];
  light: DirectionalLight;
  /** tablet apoyada en la carpeta del CEO; su pantalla (plano XY local, +Z hacia fuera) acoge el popup de la reunión */
  tablet: Group;
  /** la oficina como tal (suelo, paredes, techo y adornos): se oculta en realidad mixta, donde queda la mesa, las sillas, la pizarra y la tablet */
  office: Object3D[];
  /** pantalla de la pared (la pizarra) y de la tablet: reciben la página que se presenta */
  wallScreen: Mesh;
  tabletScreen: Mesh;
}

/** Tablet de la mesa (m, grados): `nearZ` es su borde cercano; `tiltDeg` su inclinación respecto a la mesa. */
export const TABLET = { x: 0, nearZ: -0.49, tiltDeg: 55, w: 0.54, h: 0.38 };

/** Tamaño de la pantalla de la tablet (m); la proporción debe coincidir con la del popup acoplado en ui.ts. */
export const TABLET_SCREEN = { w: 0.5, h: 0.341, z: 0.0067 };

/** 3 asientos por lado (alternando izquierda/derecha por fila); la cabecera queda libre para ver la pizarra. */
export const SEATS = [
  { x: -0.88, z: -1.4, rotY: Math.PI / 2 },
  { x: 0.88, z: -1.4, rotY: -Math.PI / 2 },
  { x: -0.88, z: -2.55, rotY: Math.PI / 2 },
  { x: 0.88, z: -2.55, rotY: -Math.PI / 2 },
  { x: -0.88, z: -3.7, rotY: Math.PI / 2 },
  { x: 0.88, z: -3.7, rotY: -Math.PI / 2 },
];

export function buildRoom(): Room {
  const g = new Group();
  g.name = 'meeting-room';
  const W = ROOM.xMax - ROOM.xMin;
  const D = ROOM.zMax - ROOM.zMin;
  const cx = (ROOM.xMax + ROOM.xMin) / 2;
  const cz = (ROOM.zMax + ROOM.zMin) / 2;
  const H = ROOM.height;

  // floor, rug
  const floorMat = new MeshStandardMaterial({ map: woodFloor(), roughness: 0.55 });
  const floor = new Mesh(new PlaneGeometry(W, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  g.add(floor);
  const rugEdge = new Mesh(new PlaneGeometry(3.7, 6.3), new MeshStandardMaterial({ color: 0x1f2630, roughness: 1 }));
  rugEdge.rotation.x = -Math.PI / 2;
  rugEdge.position.set(0, 0.004, -2.0);
  rugEdge.receiveShadow = true;
  g.add(rugEdge);
  const rugMat = new MeshStandardMaterial({ map: carpet(), roughness: 1 });
  const rug = new Mesh(new PlaneGeometry(3.4, 6.0), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.0055, -2.0);
  rug.receiveShadow = true;
  g.add(rug);

  // walls
  const wall = new MeshStandardMaterial({ map: plaster(), roughness: 0.95 });
  const trim = std(0xf4f2ec, 0.6);
  const back = mesh(new BoxGeometry(W, H, 0.1), wall, cx, H / 2, ROOM.zMin - 0.05, g);
  back.receiveShadow = true;
  const front = mesh(new BoxGeometry(W, H, 0.1), wall, cx, H / 2, ROOM.zMax + 0.05, g);
  front.receiveShadow = true;
  const right = mesh(new BoxGeometry(0.1, H, D), wall, ROOM.xMax + 0.05, H / 2, cz, g);
  right.receiveShadow = true;
  // left wall = glazed with mullions
  const xl = ROOM.xMin;
  mesh(new BoxGeometry(0.1, 0.35, D), wall, xl - 0.05, H - 0.175, cz, g);
  mesh(new BoxGeometry(0.1, 0.12, D), wall, xl - 0.05, 0.06, cz, g);
  const frame = std(0x1d1f23, 0.4, 0.5);
  const panes = 4;
  for (let i = 0; i <= panes; i++) {
    const z = ROOM.zMin + (D / panes) * i;
    box(frame, 0.08, H - 0.47, 0.07, xl + 0.01, 0.12 + (H - 0.47) / 2, z, g);
  }
  box(frame, 0.08, 0.05, D, xl + 0.01, 0.145, cz, g);
  box(frame, 0.08, 0.05, D, xl + 0.01, H - 0.38, cz, g);
  // roller blind (half drawn) and sill
  const blind = new MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.95, side: 2 });
  box(blind, 0.012, 0.62, D - 0.1, xl + 0.07, H - 0.38 - 0.31, cz, g);
  box(std(0x9a958a, 0.6), 0.02, 0.025, D - 0.1, xl + 0.07, H - 0.38 - 0.62, cz, g);
  cyl(std(0xdcd8cf, 0.6), 0.03, D - 0.1, xl + 0.07, H - 0.37, cz, g).rotation.x = Math.PI / 2;
  box(std(0xf1f0eb, 0.45), 0.2, 0.04, D, xl + 0.1, 0.12, cz, g);
  const view = new Mesh(
    new PlaneGeometry(26, 13),
    new MeshBasicMaterial({ map: cityViewTex(), toneMapped: false }),
  );
  view.rotation.y = Math.PI / 2;
  view.position.set(xl - 9, 3.2, cz);
  g.add(view);

  // baseboards + crown molding
  const crown = std(0xfaf9f5, 0.55);
  for (const [w, d, x, z] of [
    [W, 0.02, cx, ROOM.zMin + 0.01],
    [W, 0.02, cx, ROOM.zMax - 0.01],
  ] as const) {
    box(trim, w, 0.14, d, x, 0.07, z, g);
    box(trim, w, 0.02, d + 0.02, x, 0.15, z, g);
    box(crown, w, 0.09, d + 0.03, x, H - 0.045, z, g);
    box(crown, w, 0.025, d + 0.07, x, H - 0.1, z, g);
  }
  box(trim, 0.02, 0.14, D, ROOM.xMax - 0.01, 0.07, cz, g);
  box(trim, 0.02, 0.02, D, ROOM.xMax - 0.02, 0.15, cz, g);
  box(crown, 0.05, 0.09, D, ROOM.xMax - 0.025, H - 0.045, cz, g);
  box(crown, 0.09, 0.025, D, ROOM.xMax - 0.045, H - 0.1, cz, g);

  // walnut wainscot on the right wall (leaving the door opening)
  const wainTex = walnut();
  wainTex.repeat.set(0.5, 0.5);
  const wain = new MeshStandardMaterial({ map: wainTex, roughness: 0.5 });
  for (const [z0, z1] of [[ROOM.zMin, 0.6], [2.0, ROOM.zMax]] as const) {
    const len = z1 - z0;
    box(wain, 0.03, 0.85, len, ROOM.xMax - 0.015, 0.575, (z0 + z1) / 2, g);
    box(crown, 0.045, 0.035, len, ROOM.xMax - 0.0225, 1.015, (z0 + z1) / 2, g);
    for (let z = z0 + 0.25; z < z1 - 0.2; z += 0.6) {
      box(std(0x3a2314, 0.55), 0.012, 0.6, 0.012, ROOM.xMax - 0.035, 0.57, z, g);
    }
  }

  // ceiling + light panels
  const ceil = new Mesh(new PlaneGeometry(W, D), new MeshStandardMaterial({ map: ceilingTile(), roughness: 0.95 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, H, cz);
  g.add(ceil);
  const panelMat = new MeshBasicMaterial({ color: 0xfff3dd, toneMapped: false });
  const panelFrame = std(0x2b2d31, 0.4, 0.4);
  for (const z of [-0.6, -2.0, -3.4]) {
    for (const x of [-1.1, 1.1]) {
      mesh(new BoxGeometry(0.8, 0.03, 0.8), panelMat, x, H - 0.015, z, g);
      for (const [fw, fd, fx, fz] of [
        [0.88, 0.04, 0, 0.42],
        [0.88, 0.04, 0, -0.42],
        [0.04, 0.8, 0.42, 0],
        [0.04, 0.8, -0.42, 0],
      ] as const) {
        box(panelFrame, fw, 0.04, fd, x + fx, H - 0.02, z + fz, g);
      }
    }
  }
  // air-conditioning slot diffusers + sprinkler heads
  const vent = std(0xe9e8e3, 0.5);
  for (const z of [-1.3, -2.7]) {
    box(vent, 0.12, 0.012, 1.0, 0, H - 0.006, z, g);
    for (let k = -4; k <= 4; k++) box(std(0x6b6b68, 0.7), 0.004, 0.014, 0.96, k * 0.012, H - 0.01, z, g);
  }
  for (const [x, z] of [[-2.4, -1.0], [2.4, -3.0], [0, 1.2]] as const) {
    cyl(std(0xb8b8b8, 0.3, 0.9), 0.025, 0.01, x, H - 0.005, z, g);
    cyl(std(0xc23b22, 0.4), 0.004, 0.04, x, H - 0.03, z, g);
  }

  // back wall: wood slat feature panel + wall display
  const slats = new MeshStandardMaterial({ map: walnut(), roughness: 0.6 });
  const feature = box(slats, 4.6, 2.5, 0.04, 0, 1.35, ROOM.zMin + 0.02, g);
  feature.receiveShadow = true;
  const bezel = std(0x08090b, 0.3, 0.2);
  const wallBezel = box(bezel, 2.62, 1.52, 0.05, 0, 1.5, ROOM.zMin + 0.065, g);
  const wallScreen = new Mesh(
    new PlaneGeometry(2.5, 1.4),
    new MeshBasicMaterial({ map: slide(), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  wallScreen.position.set(0, 1.5, ROOM.zMin + 0.095);
  g.add(wallScreen);

  // right wall decor
  for (const [z, seed] of [[-1.2, 4], [-3.0, 9]] as const) {
    const frameM = std(0x1a1a1a, 0.5);
    box(frameM, 0.04, 0.84, 1.14, ROOM.xMax - 0.02, 1.7, z, g);
    const art = new Mesh(
      new PlaneGeometry(1.0, 0.75),
      new MeshStandardMaterial({ map: painting(seed), roughness: 0.8 }),
    );
    art.rotation.y = -Math.PI / 2;
    art.position.set(ROOM.xMax - 0.045, 1.7, z);
    g.add(art);
  }
  // credenza + coffee machine
  const cred = std(0x2c2a28, 0.55);
  box(cred, 0.5, 0.72, 2.2, ROOM.xMax - 0.27, 0.46, -4.2, g);
  box(std(0x6b4a2e, 0.4), 0.52, 0.03, 2.24, ROOM.xMax - 0.27, 0.835, -4.2, g);
  box(std(0x1c1c1e, 0.35, 0.5), 0.26, 0.34, 0.3, ROOM.xMax - 0.28, 1.025, -4.8, g);
  plant(g, ROOM.xMax - 0.45, ROOM.zMin + 0.5, 1.15);
  plant(g, ROOM.xMin + 0.5, ROOM.zMax - 0.5, 0.95);
  // door behind the viewer, with frame, panels and a lever handle
  const doorZ = 1.3;
  const leafM = std(0xb48b5d, 0.45);
  const frameM = std(0xf4f2ec, 0.55);
  box(leafM, 0.045, 2.08, 0.9, ROOM.xMax - 0.05, 1.04, doorZ, g);
  box(frameM, 0.07, 2.16, 0.08, ROOM.xMax - 0.045, 1.08, doorZ - 0.49, g);
  box(frameM, 0.07, 2.16, 0.08, ROOM.xMax - 0.045, 1.08, doorZ + 0.49, g);
  box(frameM, 0.07, 0.08, 1.06, ROOM.xMax - 0.045, 2.14, doorZ, g);
  for (const y of [0.62, 1.58]) {
    box(std(0x9c7549, 0.5), 0.012, y < 1 ? 0.8 : 0.5, 0.62, ROOM.xMax - 0.073, y + (y < 1 ? 0.05 : 0), doorZ, g);
  }
  box(std(0xd0d3d8, 0.25, 0.95), 0.03, 0.04, 0.16, ROOM.xMax - 0.085, 1.0, doorZ - 0.32, g);
  cyl(std(0xd0d3d8, 0.25, 0.95), 0.012, 0.09, ROOM.xMax - 0.075, 1.0, doorZ - 0.32, g).rotation.z = Math.PI / 2;
  // clock
  const clk = new Mesh(new PlaneGeometry(0.34, 0.34), new MeshBasicMaterial({ map: clockFace(), transparent: true }));
  clk.rotation.y = -Math.PI / 2;
  clk.position.set(ROOM.xMax - 0.04, 2.45, doorZ);
  g.add(clk);
  cyl(std(0x1b1b1b, 0.4), 0.18, 0.03, ROOM.xMax - 0.025, 2.45, doorZ, g).rotation.z = Math.PI / 2;
  // light switch + thermostat
  box(std(0xf1f0eb, 0.4), 0.012, 0.115, 0.075, ROOM.xMax - 0.006, 1.2, doorZ - 0.7, g);
  box(std(0xe5e5e2, 0.4), 0.02, 0.09, 0.09, ROOM.xMax - 0.01, 1.55, doorZ - 0.7, g);

  // bookcase and art on the wall behind the viewer
  const caseM = std(0x3a2a1e, 0.55);
  const bx = -1.9;
  const bz = ROOM.zMax - 0.2;
  box(caseM, 1.6, 2.1, 0.03, bx, 1.05, ROOM.zMax - 0.035, g);
  for (const sx of [-0.8, 0.8]) box(caseM, 0.03, 2.1, 0.36, bx + sx, 1.05, bz, g);
  for (let i = 0; i < 6; i++) box(caseM, 1.6, 0.025, 0.36, bx, 0.05 + i * 0.4, bz, g);
  const rb = rng(31);
  const bookCols = [0x8c2f39, 0x1f4e79, 0x2f6b3a, 0xc7a14a, 0x5a4a78, 0xe8e2d4, 0x1b1b1b, 0xb35a2a];
  for (let row = 0; row < 5; row++) {
    let x = bx - 0.76;
    while (x < bx + 0.7) {
      const w = 0.025 + rb() * 0.03;
      const h = 0.22 + rb() * 0.12;
      if (rb() < 0.12) {
        x += 0.12;
        continue;
      }
      const b = box(std(bookCols[Math.floor(rb() * bookCols.length)], 0.7), w, h, 0.22, x + w / 2, 0.0625 + row * 0.4 + h / 2, bz + 0.02, g);
      b.rotation.z = rb() < 0.06 ? 0.15 : 0;
      x += w + 0.002;
    }
  }
  const art = new Mesh(
    new PlaneGeometry(1.1, 0.8),
    new MeshStandardMaterial({ map: painting(14), roughness: 0.8 }),
  );
  art.rotation.y = Math.PI;
  art.position.set(1.0, 1.7, ROOM.zMax - 0.05);
  g.add(art);
  box(std(0x1a1a1a, 0.5), 1.18, 0.88, 0.04, 1.0, 1.7, ROOM.zMax - 0.025, g);

  // coffee station on the credenza
  const cz0 = -4.2;
  const stationX = ROOM.xMax - 0.27;
  const machine = std(0x202226, 0.3, 0.5);
  box(machine, 0.28, 0.4, 0.34, stationX, 0.85 + 0.2, -4.75, g);
  box(std(0x0c0c0e, 0.4), 0.06, 0.012, 0.2, stationX - 0.1, 1.02, -4.75, g);
  box(std(0xb8bcc2, 0.25, 0.9), 0.2, 0.06, 0.3, stationX, 0.88, -4.75, g);
  for (let i = 0; i < 4; i++) {
    const c = createCoffeeCup({ fill: 0.0, spoon: false, angle: i });
    c.scale.setScalar(0.9);
    c.position.set(stationX - 0.02, 0.85, -4.2 + i * 0.12);
    c.position.y = 0.85 + (i < 2 ? 0 : 0.0);
    g.add(c);
  }
  const bottle = createWaterGlass({ r: 0.03, h: 0.2, level: 0.8 });
  bottle.position.set(stationX + 0.03, 0.85, -3.7);
  g.add(bottle);
  void cz0;

  // todo lo anterior es la oficina (suelo, paredes, techo, adornos): en realidad mixta desaparece; la pizarra de la
  // pared y su marco se quedan flotando
  const office = g.children.filter((o) => o !== wallScreen && o !== wallBezel);

  // ---------------------------------------------------- table
  const topTex = walnut();
  topTex.repeat.set(0.45, 0.45);
  topTex.center.set(0.5, 0.5);
  topTex.rotation = Math.PI / 2;
  const topMat = new MeshStandardMaterial({ map: topTex, roughness: 0.32, metalness: 0.0 });
  const topGeo = new ExtrudeGeometry(roundedRect(TABLE.width, TABLE.length, 0.14), {
    depth: 0.045,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.008,
    bevelSegments: 3,
    curveSegments: 10,
  });
  topGeo.rotateX(-Math.PI / 2);
  const top = mesh(
    topGeo,
    topMat,
    0,
    TABLE.y - 0.045,
    TABLE.zFront - TABLE.length / 2,
    g,
  );
  top.castShadow = true;
  top.receiveShadow = true;
  const legM = std(0x15171b, 0.35, 0.6);
  for (const z of [-1.25, -3.65]) {
    const l = box(legM, 0.1, 0.7, 0.95, 0, 0.35, z, g);
    l.castShadow = true;
    box(legM, 0.6, 0.03, 0.9, 0, 0.015, z, g);
  }
  box(legM, 0.07, 0.07, 2.4, 0, 0.62, -2.45, g);
  const grommet = std(0x0a0a0a, 0.4, 0.5);
  cyl(grommet, 0.04, 0.004, 0, TABLE.y + 0.001, -2.45, g);

  // centre props: speakerphone, carafe, glasses
  const darkPlastic = std(0x1a1b1e, 0.4);
  cyl(darkPlastic, 0.12, 0.025, 0, TABLE.y + 0.0125, -2.0, g);
  const led = new MeshBasicMaterial({ color: 0x35d07f });
  mesh(new CylinderGeometry(0.1, 0.1, 0.002, 28), led, 0, TABLE.y + 0.027, -2.0, g);
  for (const [x, z] of [[-0.16, -2.6], [0.2, -3.4]] as const) {
    const c = createCarafe();
    c.position.set(x, TABLE.y, z);
    g.add(c);
  }
  for (const [x, z] of [[0.14, -2.3], [-0.2, -3.6]] as const) {
    const gl = createWaterGlass({ level: 0.55 + ((x * 7 + z * 3) % 0.3) });
    gl.position.set(x, TABLE.y, z);
    g.add(gl);
  }

  // my place (presiding): leather folder, pen, coffee, phone
  const leather = std(0x2a2118, 0.5);
  box(leather, 0.24, 0.02, 0.32, 0.44, TABLE.y + 0.01, -0.42, g).rotation.y = 0.08;
  box(std(0xfbfaf5, 0.9), 0.2, 0.004, 0.28, 0.44, TABLE.y + 0.022, -0.42, g).rotation.y = 0.08;
  const pen = cyl(std(0xb88b3a, 0.25, 0.8), 0.005, 0.15, 0.61, TABLE.y + 0.0055, -0.5, g);
  pen.rotation.set(0, 0, Math.PI / 2);
  pen.rotation.order = 'YXZ';
  pen.rotation.y = 1.25;
  const myCup = createCoffeeCup({ fill: 0.75, angle: 0.5 });
  myCup.position.set(-0.55, TABLE.y, -0.55);
  g.add(myCup);

  // tablet standing on the table in front of my place: the DOM popup (flat screen) or the UIKit panel (XR) sits on its screen.
  // `public/scenes/main.iwsdk.scene.json` places 'tablet-panel' on this screen: keep both in sync.
  const tablet = new Group();
  tablet.name = 'meeting-tablet';
  const tilt = (TABLET.tiltDeg * Math.PI) / 180;
  const body = std(0x1b1d22, 0.3, 0.55);
  tablet.rotation.x = -(Math.PI / 2 - tilt);
  tablet.position.set(
    TABLET.x,
    TABLE.y + 0.012 + (TABLET.h / 2) * Math.sin(tilt) + 0.006,
    TABLET.nearZ - (TABLET.h / 2) * Math.cos(tilt),
  );
  box(body, TABLET.w, TABLET.h, 0.012, 0, 0, 0, tablet).castShadow = true;
  const tabletScreen = mesh(
    new PlaneGeometry(TABLET_SCREEN.w, TABLET_SCREEN.h),
    new MeshBasicMaterial({ color: 0x12161e, toneMapped: false }),
    0,
    0,
    TABLET_SCREEN.z,
    tablet,
  );
  g.add(tablet);
  // soft contact shadow, front lip and a strut that props the tablet up from behind
  const shadow = mesh(
    new PlaneGeometry(TABLET.w + 0.1, 0.42),
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    TABLET.x,
    TABLE.y + 0.0015,
    TABLET.nearZ - 0.16,
    g,
  );
  shadow.rotation.x = -Math.PI / 2;
  box(body, TABLET.w - 0.04, 0.012, 0.012, TABLET.x, TABLE.y + 0.006, TABLET.nearZ + 0.004, g);
  const y0 = TABLE.y + 0.012;
  const topZ = TABLET.nearZ - TABLET.h * Math.cos(tilt);
  const topY = y0 + TABLET.h * Math.sin(tilt);
  const backZ = topZ - 0.2;
  const strutLen = Math.hypot(topY - y0, topZ - backZ);
  const strut = box(body, 0.03, 0.012, strutLen, TABLET.x, (topY + y0) / 2, (topZ + backZ) / 2, g);
  strut.rotation.x = -Math.atan2(topY - y0, topZ - backZ);

  // chairs for every seat (pulled out when empty)
  const chairs: Group[] = [];
  const cm = {
    fabric: std(0x2a2f38, 0.9),
    plastic: std(0x16181c, 0.5),
    metal: std(0x9aa0a8, 0.35, 0.8),
  };
  for (let i = 0; i < SEATS.length; i++) {
    const c = chair(cm);
    g.add(c);
    chairs.push(c);
  }

  // lights: pocas luces, cada luz puntual se calcula en cada píxel de cada objeto y en el visor satura la GPU
  g.add(new HemisphereLight(0xdfeaff, 0x9a8468, 1.5));
  g.add(new AmbientLight(0xfff2e0, 0.7));
  const sun = new DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(-6, 4.5, -1.5);
  sun.target.position.set(0, 0.5, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 20;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  g.add(sun, sun.target);
  return { group: g, chairs, light: sun, tablet, wallScreen, tabletScreen, office };
}

// the city view is only built once
let cityTex: CanvasTexture | null = null;
function cityViewTex(): CanvasTexture {
  cityTex ??= cityView();
  cityTex.colorSpace = SRGBColorSpace;
  return cityTex;
}
