import type { World } from '@iwsdk/core';
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';

/** Se activa abriendo la app con `?diag` o `#diag` (queda guardado; `diag=off` lo apaga). */
const KEY = 'boardroom.diag';
const W = 640;
const H = 520;
/** índices del gamepad de la mano que la app espera para los microgestos */
const EXPECT = '5 left · 6 right · 7 forward · 8 back · 9 tap';

export function readDiagFlag(): void {
  try {
    const q = `${location.search}&${location.hash.slice(1)}`;
    if (/(^|[&?])diag=(off|0)/.test(q)) localStorage.removeItem(KEY);
    else if (/(^|[&?])diag(=|&|$)/.test(q)) localStorage.setItem(KEY, '1');
  } catch {
    // sin almacenamiento
  }
}

/**
 * Panel de comprobación para las gafas reales (solo si se activa): qué entradas llegan en la sesión, si hay mirada y
 * manos, qué botones de la mano se pulsan (para confirmar el mapeo de los microgestos) y qué APIs de voz hay.
 */
export class Diagnostics {
  private enabled = false;
  private mesh: Mesh | undefined;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private last: string[] = [];
  private prev = new WeakMap<object, boolean[]>();
  private drawnAt = 0;
  private frames = 0;
  private fps = 0;
  private fpsAt = 0;

  constructor(private world: World, cleanup: (() => void)[]) {
    try {
      this.enabled = localStorage.getItem(KEY) === '1';
    } catch {
      // nada
    }
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    cleanup.push(() => this.tex.dispose());
    if (!this.enabled) return;
    this.mesh = new Mesh(new PlaneGeometry(0.64, (0.64 * H) / W), new MeshBasicMaterial({ map: this.tex, transparent: true, side: DoubleSide, toneMapped: false }));
    this.mesh.position.set(-0.55, 1.3, -0.85);
    this.mesh.rotation.y = 0.35;
    this.mesh.renderOrder = 50;
    this.world.scene.add(this.mesh);
    cleanup.push(() => this.mesh?.removeFromParent());
  }

  update(inXr: boolean): void {
    if (!this.mesh) return;
    this.mesh.visible = inXr;
    if (!inXr) return;
    const now = performance.now();
    this.frames++;
    if (now - this.fpsAt > 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
    }
    const session = this.world.renderer.xr.getSession();
    const sources = session ? Array.from(session.inputSources) : [];
    // botones que se acaban de pulsar (los microgestos llegan así)
    for (const src of sources) {
      const pad = src.gamepad;
      if (!pad) continue;
      const before = this.prev.get(src) ?? [];
      const cur = pad.buttons.map((b) => b.pressed);
      cur.forEach((on, i) => {
        if (on && !before[i]) this.last.unshift(`${src.handedness} ${src.hand ? 'hand' : 'controller'} · button ${i}`);
      });
      this.prev.set(src, cur);
    }
    this.last.length = Math.min(this.last.length, 6);
    if (now - this.drawnAt > 250) {
      this.drawnAt = now;
      this.draw(sources);
    }
  }

  private draw(sources: XRInputSource[]): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(14,16,22,.92)';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    let y = 44;
    const line = (text: string, color = '#e4e4e7', size = 24) => {
      ctx.fillStyle = color;
      ctx.font = `${size}px ui-monospace, Menlo, monospace`;
      ctx.fillText(text.slice(0, 54), 24, y);
      y += size + 8;
    };
    const hasGaze = sources.some((s) => s.targetRayMode === 'gaze');
    const ok = '#4ade80';
    const bad = '#f87171';
    line('GLASSES DIAGNOSTICS', '#f5d90a', 26);
    line(`Inputs: ${sources.length}  ·  ${this.fps} fps`);
    for (const s of sources.slice(0, 4)) line(`· ${s.handedness} ${s.targetRayMode}${s.hand ? ' hand' : ''} ${s.profiles[0] ?? ''}`, '#a1a1aa', 20);
    line(`Gaze: ${hasGaze ? 'yes' : 'no'}`, hasGaze ? ok : bad);
    line(`Hands: ${sources.some((s) => s.hand) ? 'yes' : 'no'}`, sources.some((s) => s.hand) ? ok : bad);
    line(`Expected microgestures: ${EXPECT}`, '#a1a1aa', 18);
    line('Latest buttons:', '#e4e4e7', 22);
    if (this.last.length === 0) line('  (do a microgesture or pinch)', '#a1a1aa', 20);
    for (const l of this.last) line(`  ${l}`, '#7dd3fc', 20);
    const w = window as unknown as Record<string, unknown>;
    const stt = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    const media = !!navigator.mediaDevices?.getUserMedia;
    line(`Voice: dictation ${stt ? 'yes' : 'no'} · microphone ${media ? 'yes' : 'no'}`, stt || media ? ok : bad, 22);
    this.tex.needsUpdate = true;
  }
}
