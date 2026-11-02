import type { WhiteboardItem } from './api.js';
import { BOARD_H, BOARD_W, type BoardPage, FOOTER_H, type Hotspot, drawPage, pagesOf } from './whiteboard-draw.js';
import { downloadItem } from './whiteboard-export.js';

/** Niveles de zoom; cada microgesto adelante/atrás sube o baja uno. */
const ZOOMS = [1, 1.6, 2.5, 4];
/** Margen (px de página a zoom 1) para engancharse a la zona más cercana: la mirada no es precisa. */
const SNAP = 45;
/** Tiempo (ms) durante el que lo último que se miró sigue contando como "lo señalado". */
const RECENT_MS = 2500;
/** Cuánto dura el resalte de un director antes de apagarse. */
const AGENT_MS = 9000;

const fold = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const gap = (h: Hotspot, x: number, y: number) => Math.hypot(Math.max(h.x - x, 0, x - (h.x + h.w)), Math.max(h.y - y, 0, y - (h.y + h.h)));

/**
 * Estado de la pizarra de la sala: lo que enseñan los directores, la página que se ve y si se está
 * viendo en la tablet. Lo comparten el 3D (pared + tablet), el panel XR y el popup DOM.
 */
class Board {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  items: WhiteboardItem[] = [];
  pageNo = 0;
  onTablet = false;
  /** presentación cercana: la página flota delante del CEO (se maneja con mirada, microgestos y voz) */
  near = false;
  zoom = 1;
  cx = BOARD_W / 2;
  cy = BOARD_H / 2;
  /** zonas señalables de la página que se ve */
  hotspots: Hotspot[] = [];
  focusId: string | null = null;
  pinnedId: string | null = null;
  agentId: string | null = null;
  private agentTimer = 0;
  private gaze: { x: number; y: number; at: number } | null = null;
  private recent: { id: string; at: number } | null = null;
  /** incrementa con cada cambio visible (la escena y la UI se redibujan al verlo cambiar) */
  version = 0;
  error = '';
  onChange: () => void = () => {};

  constructor() {
    this.canvas.width = BOARD_W;
    this.canvas.height = BOARD_H;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  get pages(): BoardPage[] {
    return this.items.flatMap(pagesOf);
  }

  get page(): BoardPage | undefined {
    return this.pages[this.pageNo];
  }

  /** Texto corto para botonera: "2/5 · Título". */
  get caption(): string {
    const p = this.page;
    if (!p) return '';
    return `${this.pageNo + 1}/${this.pages.length} - ${p.item.title}`;
  }

  /** Un director enseña algo nuevo: pasa a verse de inmediato (la primera página). */
  add(item: WhiteboardItem): void {
    this.items.push(item);
    this.pageNo = this.pages.findIndex((p) => p.item.id === item.id);
    this.resetView();
    this.near = !this.onTablet;
    this.changed();
  }

  clear(): void {
    if (this.items.length === 0 && !this.onTablet && !this.near) return;
    this.items = [];
    this.pageNo = 0;
    this.onTablet = false;
    this.near = false;
    this.resetView();
    this.changed();
  }

  step(delta: number): void {
    const n = this.pages.length;
    if (n === 0) return;
    this.pageNo = (this.pageNo + delta + n) % n;
    this.resetView();
    this.changed();
  }

  toggleTablet(): void {
    if (this.pages.length === 0) return;
    this.onTablet = !this.onTablet;
    if (this.onTablet) this.near = false;
    this.changed();
  }

  /** Abre o cierra la presentación cercana. */
  toggleNear(on = !this.near): void {
    if (this.pages.length === 0) return;
    this.near = on;
    if (on) this.onTablet = false;
    this.changed();
  }

  // ---------------------------------------------------------------- vista: zoom y desplazamiento

  /** Zoom en pasos, centrado en lo que se mira (o en el centro de la vista si no se mira nada). */
  zoomBy(dir: 1 | -1): void {
    if (this.pages.length === 0) return;
    const i = ZOOMS.indexOf(this.zoom);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 0 : i) + dir))] ?? 1;
    if (next === this.zoom) return;
    const [ax, ay] = this.anchor();
    // el punto mirado se queda donde está en pantalla
    this.cx = ax - ((ax - this.cx) * this.zoom) / next;
    this.cy = ay - ((ay - this.cy) * this.zoom) / next;
    this.zoom = next;
    this.clampView();
    this.changed();
  }

  /** Con zoom, mueve la vista un tercio de pantalla a izquierda (-1) o derecha (+1). */
  pan(dir: -1 | 1): void {
    if (this.zoom <= 1) return;
    this.cx += (dir * BOARD_W) / this.zoom / 3;
    this.clampView();
    this.changed();
  }

  resetView(): void {
    this.zoom = 1;
    this.cx = BOARD_W / 2;
    this.cy = BOARD_H / 2;
    this.focusId = this.pinnedId = this.agentId = null;
    this.gaze = this.recent = null;
  }

  /** Vuelve a la vista completa de la página. */
  fit(): void {
    if (this.zoom === 1 && !this.pinnedId && !this.agentId) return;
    this.zoom = 1;
    this.cx = BOARD_W / 2;
    this.cy = BOARD_H / 2;
    this.pinnedId = this.agentId = null;
    this.changed();
  }

  private clampView(): void {
    const hw = BOARD_W / 2 / this.zoom;
    const hh = BOARD_H / 2 / this.zoom;
    this.cx = Math.max(hw, Math.min(BOARD_W - hw, this.cx));
    this.cy = Math.max(hh, Math.min(BOARD_H - hh, this.cy));
  }

  /** Punto de la página que se mantiene fijo al hacer zoom. */
  private anchor(): [number, number] {
    const g = this.gaze;
    if (g && performance.now() - g.at < RECENT_MS) return [g.x, g.y];
    const h = this.hotspots.find((x) => x.id === (this.pinnedId ?? this.focusId));
    return h ? [h.x + h.w / 2, h.y + h.h / 2] : [this.cx, this.cy];
  }

  // ---------------------------------------------------------------- mirada, selección y señalado

  /** Punto de pantalla (px del canvas, 0..1280 × 0..720) → punto de la página, deshaciendo el zoom. */
  private toPage(sx: number, sy: number): [number, number] {
    return [this.cx + (sx - BOARD_W / 2) / this.zoom, this.cy + (sy - BOARD_H / 2) / this.zoom];
  }

  private nearest(px: number, py: number): Hotspot | null {
    const tol = SNAP / this.zoom;
    let best: Hotspot | null = null;
    let bestD = Infinity;
    for (const h of this.hotspots) {
      const d = gap(h, px, py);
      if (d < bestD || (d === bestD && best && h.w * h.h < best.w * best.h)) {
        best = h;
        bestD = d;
      }
    }
    if (!best || bestD > tol) return null;
    // histéresis: la mirada tiembla, así que se aguanta la zona actual si sigue casi igual de cerca
    const cur = this.hotspots.find((h) => h.id === this.focusId);
    if (cur && cur !== best && gap(cur, px, py) <= bestD + tol * 0.3) return cur;
    return best;
  }

  /** La mirada está en el punto de pantalla (sx, sy): engancha la zona señalable más cercana. */
  focusAt(sx: number, sy: number): void {
    if (sy > BOARD_H - FOOTER_H) return this.clearFocus();
    const [px, py] = this.toPage(sx, sy);
    this.gaze = { x: px, y: py, at: performance.now() };
    const h = this.nearest(px, py);
    this.setFocus(h?.id ?? null);
  }

  clearFocus(): void {
    this.setFocus(null);
  }

  private setFocus(id: string | null): void {
    if (id === this.focusId) return;
    if (this.focusId) this.recent = { id: this.focusId, at: performance.now() };
    this.focusId = id;
    this.changed();
  }

  /** Pellizco: fija la zona mirada (o suelta la que estaba fijada). */
  pinAt(sx: number, sy: number): void {
    if (sy > BOARD_H - FOOTER_H) return;
    const [px, py] = this.toPage(sx, sy);
    const h = this.nearest(px, py);
    this.pinnedId = h && h.id !== this.pinnedId ? h.id : null;
    this.changed();
  }

  unpin(): void {
    if (!this.pinnedId) return;
    this.pinnedId = null;
    this.changed();
  }

  /** Lo que el CEO está señalando: lo fijado, o lo que miraba justo ahora, descrito para los directores. */
  pointing(): string | null {
    const p = this.page;
    if (!p) return null;
    let id = this.pinnedId ?? this.focusId;
    if (!id && this.recent && performance.now() - this.recent.at < RECENT_MS) id = this.recent.id;
    const h = this.hotspots.find((x) => x.id === id);
    if (!h) return null;
    const title = p.item.kind === 'slides' ? (p.item.slides[p.index]?.title ?? p.item.title) : p.item.title;
    return `I point at the whiteboard "${title}": ${h.label}`;
  }

  /** Un director señala algo de la página (lo busca por texto); se acerca la vista a esa zona. */
  highlight(target: string): boolean {
    const words = fold(target)
      .split(/[^a-z0-9%€.,]+/)
      .filter((w) => w.length > 1);
    if (words.length === 0) return false;
    let best: Hotspot | null = null;
    let bestScore = 0;
    for (const h of this.hotspots) {
      const label = fold(h.label);
      const score = words.filter((w) => label.includes(w)).length / words.length;
      if (score > bestScore) {
        best = h;
        bestScore = score;
      }
    }
    if (!best || bestScore < 0.5) return false;
    this.agentId = best.id;
    this.zoom = Math.max(this.zoom, 2.5);
    this.cx = best.x + best.w / 2;
    this.cy = best.y + best.h / 2;
    this.clampView();
    clearTimeout(this.agentTimer);
    this.agentTimer = window.setTimeout(() => {
      this.agentId = null;
      this.changed();
    }, AGENT_MS);
    this.changed();
    return true;
  }

  async download(): Promise<void> {
    const p = this.page;
    if (!p) return;
    try {
      this.error = '';
      await downloadItem(p.item);
    } catch (e) {
      this.error = (e as Error).message;
      this.changed();
    }
  }

  private changed(): void {
    const p = this.page;
    if (p) {
      this.hotspots = drawPage(this.ctx, p, this.pageNo + 1, this.pages.length, {
        zoom: this.zoom,
        cx: this.cx,
        cy: this.cy,
        focus: this.focusId,
        pinned: this.pinnedId,
        agent: this.agentId,
      });
    } else this.hotspots = [];
    this.version++;
    this.onChange();
  }
}

export const board = new Board();
