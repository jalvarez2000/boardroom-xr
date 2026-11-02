import type { WhiteboardItem } from './api.js';

export const BOARD_W = 1280;
export const BOARD_H = 720;

/** Zona señalable de una página (coordenadas de la página, sin zoom): una barra, un punto, un párrafo… */
export interface Hotspot {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** cómo se describe a los directores: "valor de "T3": 42 M€" */
  label: string;
}

/** Vista de la página: zoom, centro (coordenadas de la página) y qué zonas se resaltan. */
export interface BoardView {
  zoom: number;
  cx: number;
  cy: number;
  focus?: string | null;
  pinned?: string | null;
  /** zona a la que apunta un director */
  agent?: string | null;
}

/** Una página de la pizarra: cada diapositiva de una presentación es una página; el resto de elementos, una. */
export interface BoardPage {
  item: WhiteboardItem;
  /** 0-based dentro del elemento */
  index: number;
  count: number;
}

const PALETTE = ['#3b82f6', '#4ade80', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#94a3b8'];
const KIND_LABEL: Record<WhiteboardItem['kind'], string> = {
  document: 'DOCUMENT',
  chart: 'CHART',
  web: 'WEB SOURCE',
  slides: 'PRESENTATION',
  notes: 'NOTES',
};

export function pagesOf(item: WhiteboardItem): BoardPage[] {
  const count = item.kind === 'slides' ? item.slides.length : 1;
  return Array.from({ length: count }, (_, index) => ({ item, index, count }));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number): number {
  const lines = wrap(ctx, text, maxW);
  lines.slice(0, maxLines).forEach((l, i) => {
    const last = i === maxLines - 1 && lines.length > maxLines;
    ctx.fillText(last ? `${l.slice(0, -1)}…` : l, x, y + i * lh);
  });
  return y + Math.min(lines.length, maxLines) * lh;
}

/** Como `paragraph`, pero además registra una zona por cada `group` líneas. */
function block(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  maxLines: number,
  hs: Hotspot[],
  prefix: string,
  group = 3,
): number {
  const lines = wrap(ctx, text, maxW).slice(0, maxLines);
  const end = paragraph(ctx, text, x, y, maxW, lh, maxLines);
  for (let g = 0; g * group < lines.length; g++) {
    const part = lines.slice(g * group, (g + 1) * group);
    hs.push({
      id: `${prefix}-${g}`,
      x: x - 10,
      y: y + g * group * lh - lh * 0.8,
      w: maxW + 20,
      h: part.length * lh,
      label: `${prefix} "${part.join(' ').slice(0, 110)}"`,
    });
  }
  return end;
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : String(Math.round(n * 100) / 100));

function drawChart(ctx: CanvasRenderingContext2D, it: Extract<WhiteboardItem, { kind: 'chart' }>, x: number, y: number, w: number, h: number, hs: Hotspot[]): void {
  const unit = it.unit ? ` ${it.unit}` : '';
  const valueLabel = (si: number, i: number, v: number) =>
    `value of "${it.labels[i] ?? i + 1}"${it.series.length > 1 ? ` in series "${it.series[si]?.name ?? si + 1}"` : ''}: ${fmt(v)}${unit}`;
  ctx.font = '500 24px system-ui, sans-serif';
  if (it.series.length > 1 || it.chartType === 'pie') {
    // leyenda
    const entries = it.chartType === 'pie' ? it.labels : it.series.map((s) => s.name);
    entries.slice(0, 8).forEach((name, i) => {
      const lx = it.chartType === 'pie' ? x + w * 0.62 : x + i * 200;
      const ly = it.chartType === 'pie' ? y + 40 + i * 44 : y - 18;
      ctx.fillStyle = PALETTE[i % PALETTE.length] ?? '#fff';
      ctx.fillRect(lx, ly - 18, 22, 22);
      ctx.fillStyle = '#d7e2f7';
      ctx.fillText(name.slice(0, 22), lx + 32, ly);
    });
  }
  if (it.chartType === 'pie') {
    const vals = it.series[0]?.values ?? [];
    const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const cx = x + w * 0.28;
    const cy = y + h / 2;
    const r = Math.min(w * 0.26, h / 2);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
      ctx.fillStyle = PALETTE[i % PALETTE.length] ?? '#fff';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.fill();
      const mid = (a0 + a1) / 2;
      hs.push({
        id: `pie-${i}`,
        x: cx + Math.cos(mid) * r * 0.62 - 50,
        y: cy + Math.sin(mid) * r * 0.62 - 40,
        w: 100,
        h: 80,
        label: `slice "${it.labels[i] ?? i + 1}": ${fmt(v)}${unit} (${Math.round((Math.max(0, v) / total) * 100)} %)`,
      });
      a0 = a1;
    });
    ctx.fillStyle = '#d7e2f7';
    vals.slice(0, 8).forEach((v, i) => ctx.fillText(`${fmt(v)}${it.unit ?? ''}`, x + w * 0.62 + 220, y + 40 + i * 44));
    return;
  }
  const all = it.series.flatMap((s) => s.values);
  const max = Math.max(...all, 0) || 1;
  const min = Math.min(...all, 0);
  const span = max - min || 1;
  const top = y + 10;
  const bottom = y + h - 50;
  const left = x + 70;
  const right = x + w;
  const py = (v: number) => bottom - ((v - min) / span) * (bottom - top);
  ctx.strokeStyle = 'rgba(199,214,243,.25)';
  ctx.lineWidth = 1.5;
  ctx.fillStyle = '#9fb7e0';
  ctx.font = '400 20px system-ui, sans-serif';
  for (let g = 0; g <= 4; g++) {
    const v = min + (span * g) / 4;
    ctx.beginPath();
    ctx.moveTo(left, py(v));
    ctx.lineTo(right, py(v));
    ctx.stroke();
    ctx.fillText(fmt(v), x, py(v) + 6);
  }
  const n = it.labels.length;
  const slot = (right - left) / n;
  ctx.font = '500 22px system-ui, sans-serif';
  it.labels.forEach((l, i) => {
    ctx.fillStyle = '#c7d6f3';
    ctx.fillText(l.slice(0, 12), left + i * slot + 6, bottom + 34);
  });
  it.series.forEach((s, si) => {
    const color = PALETTE[si % PALETTE.length] ?? '#fff';
    if (it.chartType === 'bar') {
      const bw = (slot * 0.7) / it.series.length;
      s.values.slice(0, n).forEach((v, i) => {
        const bx = left + i * slot + slot * 0.15 + si * bw;
        ctx.fillStyle = color;
        ctx.fillRect(bx, Math.min(py(v), py(0)), bw - 4, Math.abs(py(v) - py(0)));
        const top0 = Math.min(py(v), py(0)) - 34;
        hs.push({ id: `bar-${si}-${i}`, x: bx - 6, y: top0, w: bw + 8, h: Math.max(80, bottom - top0 + 40), label: valueLabel(si, i, v) });
        ctx.fillStyle = '#fff';
        ctx.font = '500 20px system-ui, sans-serif';
        ctx.fillText(fmt(v), bx, py(v) - 8);
      });
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      s.values.slice(0, n).forEach((v, i) => {
        const px = left + i * slot + slot / 2;
        if (i === 0) ctx.moveTo(px, py(v));
        else ctx.lineTo(px, py(v));
      });
      ctx.stroke();
      ctx.fillStyle = color;
      s.values.slice(0, n).forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(left + i * slot + slot / 2, py(v), 8, 0, Math.PI * 2);
        ctx.fill();
        hs.push({ id: `pt-${si}-${i}`, x: left + i * slot + slot / 2 - 45, y: py(v) - 45, w: 90, h: 90, label: valueLabel(si, i, v) });
      });
    }
  });
  if (it.unit) {
    ctx.fillStyle = '#9fb7e0';
    ctx.font = '400 22px system-ui, sans-serif';
    ctx.fillText(`Unit: ${it.unit}`, right - 220, y - 18);
  }
}

export const FOOTER_H = 62;

/** Dibuja una página en el canvas de la pizarra (1280×720) con la vista dada y devuelve sus zonas señalables. */
export function drawPage(ctx: CanvasRenderingContext2D, page: BoardPage, pageNo: number, pageTotal: number, view?: BoardView): Hotspot[] {
  const it = page.item;
  const hs: Hotspot[] = [];
  const zoom = view?.zoom ?? 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, BOARD_W, BOARD_H);
  g.addColorStop(0, '#0f1b33');
  g.addColorStop(1, '#17335c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  ctx.textBaseline = 'alphabetic';
  // el contenido se dibuja con zoom alrededor de (cx, cy); el pie va siempre fijo
  ctx.save();
  ctx.translate(BOARD_W / 2, BOARD_H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-(view?.cx ?? BOARD_W / 2), -(view?.cy ?? BOARD_H / 2));

  // cabecera: tipo + título
  ctx.fillStyle = '#f5d90a';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(KIND_LABEL[it.kind], 70, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 52px system-ui, sans-serif';
  const title = it.kind === 'slides' ? it.slides[page.index]?.title ?? it.title : it.title;
  paragraph(ctx, title, 70, 132, BOARD_W - 140, 60, 2);

  ctx.fillStyle = '#d7e2f7';
  const bx = 70;
  const by = 230;
  const bw = BOARD_W - 140;
  const bh = 400;
  switch (it.kind) {
    case 'document': {
      ctx.fillStyle = '#9fb7e0';
      ctx.font = '500 28px system-ui, sans-serif';
      ctx.fillText(it.name, bx, by - 10);
      ctx.fillStyle = '#d7e2f7';
      ctx.font = '400 28px system-ui, sans-serif';
      block(ctx, it.excerpt.replace(/\n{2,}/g, '\n'), bx, by + 40, bw, 38, 9, hs, 'document excerpt');
      break;
    }
    case 'chart':
      drawChart(ctx, it, bx, by + 10, bw, bh - 10, hs);
      break;
    case 'web': {
      ctx.fillStyle = '#7dd3fc';
      ctx.font = '500 28px system-ui, sans-serif';
      paragraph(ctx, it.url, bx, by, bw, 36, 2);
      hs.push({ id: 'url', x: bx - 10, y: by - 30, w: bw + 20, h: 80, label: `source link ${it.url}` });
      ctx.fillStyle = '#d7e2f7';
      ctx.font = '400 32px system-ui, sans-serif';
      block(ctx, it.summary, bx, by + 90, bw, 44, 8, hs, 'source summary');
      break;
    }
    case 'slides': {
      ctx.font = '400 40px system-ui, sans-serif';
      (it.slides[page.index]?.bullets ?? []).forEach((b, i) => {
        ctx.fillStyle = '#4ade80';
        ctx.fillText('•', bx, by + 40 + i * 64);
        ctx.fillStyle = '#e6eefc';
        paragraph(ctx, b, bx + 40, by + 40 + i * 64, bw - 40, 44, 1);
        hs.push({ id: `bullet-${i}`, x: bx - 10, y: by + 40 + i * 64 - 42, w: bw + 20, h: 60, label: `point "${b.slice(0, 110)}"` });
      });
      break;
    }
    case 'notes':
      ctx.font = '400 34px system-ui, sans-serif';
      block(ctx, it.body.replace(/^- /gm, '• '), bx, by + 30, bw, 46, 8, hs, 'note');
      break;
  }

  // resaltes: un velo sutil (sin contornos) y una barrita lateral; el amarillo es lo que fijó el CEO
  const mark = (id: string | null | undefined, fill: string, bar: string) => {
    const h = id ? hs.find((x) => x.id === id) : undefined;
    if (!h) return;
    ctx.fillStyle = fill;
    ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = bar;
    ctx.fillRect(h.x - 8, h.y, 5, h.h);
  };
  mark(view?.focus, 'rgba(255,255,255,.10)', 'rgba(255,255,255,.45)');
  mark(view?.pinned, 'rgba(245,217,10,.20)', '#f5d90a');
  mark(view?.agent, 'rgba(34,211,238,.24)', '#22d3ee');
  ctx.restore();

  // pie: quién lo presenta y página
  ctx.fillStyle = '#12243f';
  ctx.fillRect(0, BOARD_H - FOOTER_H, BOARD_W, FOOTER_H);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(0, BOARD_H - FOOTER_H, BOARD_W, FOOTER_H);
  ctx.fillStyle = '#c7d6f3';
  ctx.font = '400 26px system-ui, sans-serif';
  ctx.fillText(`Presented by: ${it.by}`, 70, BOARD_H - 22);
  const tag = `${zoom > 1 ? `${Math.round(zoom * 10) / 10}×  ·  ` : ''}${pageNo} / ${pageTotal}`;
  ctx.fillText(tag, BOARD_W - 70 - ctx.measureText(tag).width, BOARD_H - 22);
  return hs;
}
