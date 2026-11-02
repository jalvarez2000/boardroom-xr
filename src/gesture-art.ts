import { type HandPose, HandStage, REST_POSE } from './hand-stage.js';

/**
 * Ilustraciones animadas del tutorial (dibujadas con canvas, sin ficheros): la mano de lado con el índice
 * enroscado y el pulgar sobre su lateral, que es la postura de los microgestos, más iconos de lo que provoca
 * cada gesto. El mismo dibujo se usa en la ventana del navegador y, como textura, dentro de XR.
 */
export const ART_W = 400;
export const ART_H = 340;

const SKIN = '#efc7a2';
const SKIN_THUMB = '#f7d9bd';
const LINE = 'rgba(40,24,12,.45)';
const ACCENT = '#f5d90a';
const CYAN = '#22d3ee';
const INK = '#e4e4e7';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0→1→0 con meseta: sube en [a,b], se mantiene hasta c y baja hasta d */
const pulse = (t: number, a: number, b: number, c: number, d: number) => ease(clamp01((t - a) / (b - a))) * (1 - ease(clamp01((t - c) / (d - c))));

function capsule(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number, fill: string): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = LINE;
  ctx.lineWidth = r * 2 + 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = r * 2;
  ctx.stroke();
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, alpha: number): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 16 * Math.cos(a - 0.5), y2 - 16 * Math.sin(a - 0.5));
  ctx.lineTo(x2 - 16 * Math.cos(a + 0.5), y2 - 16 * Math.sin(a + 0.5));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, color: string): void {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, 10 + k * 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, look: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.quadraticCurveTo(0, -26, 26, 0);
  ctx.quadraticCurveTo(0, 26, -26, 0);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(look * 8, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function mic(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.roundRect(-9, -26, 18, 34, 9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 2, 18, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(0, 30);
  ctx.moveTo(-10, 30);
  ctx.lineTo(10, 30);
  ctx.stroke();
  ctx.restore();
}

function magnifier(ctx: CanvasRenderingContext2D, x: number, y: number, plus: boolean, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, Math.PI * 2);
  ctx.moveTo(x + 18, y + 18);
  ctx.lineTo(x + 38, y + 38);
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x + 12, y);
  if (plus) {
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x, y + 12);
  }
  ctx.stroke();
  ctx.restore();
}

function page(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - 30, y - 22, 60, 44, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  for (let i = 0; i < 3; i++) ctx.fillRect(x - 20, y - 12 + i * 11, 40 - i * 8, 4);
  ctx.restore();
}

/** Mano de lado, postura de microgesto: índice enroscado (punta a la izquierda) y la punta del pulgar en (tx, ty). */
function microHand(ctx: CanvasRenderingContext2D, tx: number, ty: number): void {
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(238, 150, 112, 130, 34);
  ctx.fill();
  ctx.stroke();
  capsule(ctx, 262, 188, 120, 188, 22, SKIN);
  // el pulgar descansa sobre el lateral del índice
  capsule(ctx, 285, 262, tx, ty, 15, SKIN_THUMB);
}

type Draw = (ctx: CanvasRenderingContext2D, t: number) => void;

// ---------------------------------------------------------------- mano 3D (avatar de la sala)

let stage: HandStage | null = null;
let stageFailed = false;

/** La mano 3D se crea la primera vez que hace falta; si no hay WebGL o aún carga, se usa la mano dibujada. */
function hand3d(): HandStage | null {
  if (stageFailed) return null;
  if (!stage) {
    try {
      stage = new HandStage(ART_W, ART_H);
    } catch {
      stageFailed = true;
      return null;
    }
  }
  return stage.ready ? stage : null;
}

/** Pinta la mano 3D en la pose dada; devuelve false si todavía no está lista. */
function drawHand(ctx: CanvasRenderingContext2D, pose: Partial<HandPose>): boolean {
  const h = hand3d();
  if (!h) return false;
  h.render({ ...REST_POSE, ...pose });
  ctx.drawImage(h.canvas, 0, 0, ART_W, ART_H);
  return true;
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** 0 · mirar y pellizcar */
const pinch: Draw = (ctx, t) => {
  const k = pulse(t, 0.25, 0.4, 0.55, 0.7); // 1 = pellizco cerrado
  // el botón que se mira
  const lit = pulse(t, 0.1, 0.2, 0.9, 1);
  ctx.fillStyle = lerpColor('#2b3350', '#4f46e5', Math.max(lit * 0.6, k));
  ctx.beginPath();
  ctx.roundRect(130, 28, 140, 48, 24);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Next', 200, 60);
  eye(ctx, 62, 52, 1, 1);
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = 'rgba(228,228,231,.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(96, 52);
  ctx.lineTo(124, 52);
  ctx.stroke();
  ctx.setLineDash([]);
  // mano: índice y pulgar que se juntan
  const ok = drawHand(ctx, { index: mix(0.12, 0.5, k), thumbIn: 0.3, thumbLift: mix(-1.0, -2.5, k), thumbBend: mix(0.2, 0.5, k) });
  if (!ok) {
    const gap = lerp(46, 0, k);
    capsule(ctx, 160, 300, 188 - gap / 2, 168, 17, SKIN);
    capsule(ctx, 270, 300, 232 + gap / 2, 168, 17, SKIN_THUMB);
  }
  ring(ctx, 118, 222, clamp01((t - 0.4) / 0.4), ACCENT);
};

/** 1 · toque de pulgar = micrófono */
const tap: Draw = (ctx, t) => {
  const k = pulse(t, 0.25, 0.4, 0.5, 0.65);
  if (!drawHand(ctx, { thumbLift: mix(-2.2, -3.1, k), thumbBend: 0.6, thumbIn: 0.3 })) microHand(ctx, 175, lerp(222, 196, k));
  ring(ctx, 120, 150, clamp01((t - 0.4) / 0.4), ACCENT);
  const glow = pulse(t, 0.4, 0.6, 0.9, 1);
  mic(ctx, 78, 64, 1.3, glow > 0.1 ? ACCENT : INK);
  ring(ctx, 78, 64, clamp01((t - 0.45) / 0.5), ACCENT);
};

/** 2 · adelante / atrás = zoom */
const swipeUD: Draw = (ctx, t) => {
  // primera mitad: adelante (el pulgar sube sobre el índice); segunda: atrás
  const fwd = t < 0.5;
  const u = fwd ? t * 2 : (t - 0.5) * 2;
  const m = pulse(u, 0.15, 0.5, 0.6, 0.9);
  const lift = fwd ? mix(-2.4, -3.6, m) : mix(-3.6, -2.4, m);
  if (!drawHand(ctx, { thumbLift: lift, thumbBend: 0.6, thumbIn: 0.3 })) microHand(ctx, 175, fwd ? lerp(214, 160, m) : lerp(160, 214, m));
  arrow(ctx, 40, fwd ? 190 : 120, 40, fwd ? 120 : 190, ACCENT, m);
  ctx.fillStyle = INK;
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(fwd ? 'forward' : 'back', 52, 262);
  magnifier(ctx, 300, 64, fwd, 0.35 + 0.65 * m);
};

/** 3 · izquierda / derecha = páginas */
const swipeLR: Draw = (ctx, t) => {
  // izquierda (siguiente), vuelta, derecha (anterior), vuelta
  const seg = Math.floor(t * 4) % 4;
  const u = (t * 4) % 1;
  const m = pulse(u, 0.1, 0.55, 0.65, 0.95);
  const dir = seg < 2 ? -1 : 1;
  const moving = seg === 0 || seg === 2;
  // el pulgar se desliza a lo largo del índice: hacia la punta (izquierda) o hacia la palma (derecha)
  const bend = moving ? (dir < 0 ? mix(0.95, 0.15, m) : mix(0.15, 0.95, m)) : seg === 1 ? 0.15 : 0.95;
  if (!drawHand(ctx, { thumbLift: -3, thumbBend: bend, thumbIn: 0.3 })) microHand(ctx, 175 + (moving ? dir * 52 * m : 0), 190);
  if (moving) arrow(ctx, 200 + dir * -50, 262, 200 + dir * 60, 262, ACCENT, m);
  // la página se desliza en el mismo sentido
  const slide = moving ? dir * 70 * m : 0;
  page(ctx, 200 + slide, 66, '#6d8bd8', 1 - m * (moving ? 1 : 0));
  page(ctx, 200 + slide - dir * 140, 66, '#a3b8ea', moving ? m : 0);
  ctx.fillStyle = INK;
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(moving ? (dir < 0 ? 'left: next' : 'right: previous') : '', 200, 304);
};

/** 4 · señalar y preguntar */
const point: Draw = (ctx, t) => {
  const bars = [0.45, 0.62, 0.8, 0.95];
  const look = clamp01(t / 0.25);
  const pinned = pulse(t, 0.45, 0.55, 1.5, 1.6);
  bars.forEach((h, i) => {
    const x = 40 + i * 62;
    const y = 220 - h * 150;
    const hot = i === 2;
    ctx.fillStyle = hot && pinned > 0.5 ? '#c9b43a' : hot && look > 0.9 ? '#8fb2f2' : '#3b82f6';
    ctx.fillRect(x, y, 44, 220 - y);
  });
  // mirada que viaja hasta la tercera barra
  eye(ctx, lerp(60, 164, ease(look)), 262, 0.9, 1);
  ring(ctx, 164, 140, clamp01((t - 0.45) / 0.35), ACCENT);
  // pregunta en voz alta
  const bub = ease(clamp01((t - 0.62) / 0.2));
  if (bub > 0) {
    ctx.save();
    ctx.globalAlpha = bub;
    ctx.fillStyle = '#2b3350';
    ctx.beginPath();
    ctx.roundRect(236, 70 + (1 - bub) * 10, 150, 84, 16);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Why is this', 250, 106 + (1 - bub) * 10);
    ctx.fillText('dropping?', 250, 132 + (1 - bub) * 10);
    ctx.restore();
    mic(ctx, 340, 200, 0.9, ACCENT);
  }
};

/** 5 · teclado y cuaderno */
const typing: Draw = (ctx, t) => {
  // teclado de la mesa: una tecla se ilumina con la mirada y se pulsa
  const rows = [10, 10, 10, 9];
  const cur = Math.floor(t * 6) % 6;
  const hot = [[1, 2], [2, 5], [1, 8], [2, 8], [2, 0], [1, 4]][cur] ?? [1, 2];
  const press = pulse((t * 6) % 1, 0.3, 0.45, 0.6, 0.8);
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const x = 24 + r * 8 + i * 30;
      const y = 178 + r * 32;
      const on = r === hot[0] && i === hot[1];
      ctx.fillStyle = on ? lerpColor('#4a5270', '#4f46e5', press) : '#2c3140';
      ctx.beginPath();
      ctx.roundRect(x, y, 26, 26, 6);
      ctx.fill();
    }
  });
  ctx.fillStyle = '#2c3140';
  ctx.beginPath();
  ctx.roundRect(70, 306, 180, 22, 6);
  ctx.fill();
  const hx = 24 + hot[0]! * 8 + hot[1]! * 30 + 13;
  eye(ctx, hx, 150, 0.7, 1);
  // cuaderno: las líneas se van escribiendo
  ctx.fillStyle = '#fbfaf5';
  ctx.beginPath();
  ctx.roundRect(292, 40, 92, 128, 8);
  ctx.fill();
  ctx.fillStyle = '#7a8197';
  for (let i = 0; i < 5; i++) {
    const w = clamp01(t * 1.6 - i * 0.28) * (i === 4 ? 40 : 66);
    ctx.fillRect(304, 64 + i * 22, w, 5);
  }
  arrow(ctx, 250, 196, 296, 120, ACCENT, 0.4 + 0.6 * press);
};

/** 6 · órdenes de voz */
const voice: Draw = (ctx, t) => {
  mic(ctx, 200, 110, 2.1, ACCENT);
  for (let i = 0; i < 3; i++) ring(ctx, 200, 110, (t * 1.5 + i / 3) % 1, 'rgba(245,217,10,.8)');
  const words = ['zoom in', 'zoom out', 'next', 'close the whiteboard'];
  const w = words[Math.floor(t * words.length) % words.length] ?? '';
  const u = (t * words.length) % 1;
  ctx.save();
  ctx.globalAlpha = Math.min(1, u * 5) * Math.min(1, (1 - u) * 5);
  ctx.fillStyle = '#2b3350';
  ctx.font = '600 28px system-ui, sans-serif';
  const tw = ctx.measureText(`"${w}"`).width;
  ctx.beginPath();
  ctx.roundRect(200 - tw / 2 - 22, 244, tw + 44, 56, 28);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(`"${w}"`, 200, 282);
  ctx.restore();
};

function lerpColor(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i] ?? v, k))).join(',')})`;
}

const ARTS: { draw: Draw; period: number }[] = [
  { draw: pinch, period: 2.6 },
  { draw: tap, period: 2.4 },
  { draw: swipeUD, period: 4 },
  { draw: swipeLR, period: 5.2 },
  { draw: point, period: 4.2 },
  { draw: typing, period: 6 },
  { draw: voice, period: 4 },
];

/** Dibuja el cuadro de la ilustración del paso `step` en el instante `seconds`. */
export function drawGestureArt(ctx: CanvasRenderingContext2D, step: number, seconds: number): void {
  const art = ARTS[step] ?? ARTS[0]!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ART_W, ART_H);
  ctx.fillStyle = '#1b2030';
  ctx.beginPath();
  ctx.roundRect(0, 0, ART_W, ART_H, 24);
  ctx.fill();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  art.draw(ctx, (seconds % art.period) / art.period);
}
