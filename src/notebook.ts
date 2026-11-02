import { type Object3D, PokeInteractable, RayInteractable, type World } from '@iwsdk/core';
import { BoxGeometry, CanvasTexture, Group, LinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { bridge } from './bridge.js';
import { notes } from './notes.js';
import { TABLE } from './room.js';

/** Dónde descansa el cuaderno: a la derecha del sitio del CEO. */
const REST = { x: 0.44, z: -0.42, yaw: 0.08 };
/** A cuánto se acerca al leer (m) y cuánto crece. */
const READ = { dist: 0.55, drop: 0.06, scale: 1.35 };

const PAGE_W = 630;
const PAGE_H = 886;
const LINE_H = 52;
const TOP = 150;
const MARGIN_X = 78;
const LINES_PER_PAGE = Math.floor((PAGE_H - TOP - 70) / LINE_H);
const FONT = '38px "Segoe Print", "Bradley Hand", "Noteworthy", "Comic Sans MS", cursive';

const rotX90 = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);

/**
 * Cuaderno de notas sobre la mesa: lo que se teclea se «escribe» en su página. Al pinchar sobre él (mirada + pellizco,
 * dedo o rayo) se acerca a los ojos para leerlo, y al volver a pinchar vuelve a su sitio.
 */
export class Notebook {
  readonly group = new Group();
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private drawn = '';
  private drawnAt = 0;
  private pos = new Vector3();
  private fwd = new Vector3();
  private down = new Vector3();
  private qCam = new Quaternion();
  private goalQ = new Quaternion();
  private goalP = new Vector3();
  private restP = new Vector3();
  private restQ = new Quaternion();

  constructor(world: World, cleanup: (() => void)[]) {
    this.canvas.width = PAGE_W;
    this.canvas.height = PAGE_H;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    // textura dinámica: sin mipmaps, para que cada subida no obligue a la GPU a regenerarlos (tirón al teclear)
    this.tex.generateMipmaps = false;
    this.tex.minFilter = LinearFilter;
    this.tex.anisotropy = 8;
    cleanup.push(() => this.tex.dispose());

    const leather = new MeshStandardMaterial({ color: 0x2a2118, roughness: 0.5 });
    const cover = new Mesh(new BoxGeometry(0.24, 0.02, 0.32), leather);
    cover.position.y = 0.01;
    const paper = new Mesh(new BoxGeometry(0.228, 0.014, 0.308), new MeshStandardMaterial({ color: 0xf1efe6, roughness: 0.9 }));
    paper.position.y = 0.027;
    const page = new Mesh(new PlaneGeometry(0.21, (0.21 * PAGE_H) / PAGE_W), new MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    page.rotation.x = -Math.PI / 2;
    page.position.y = 0.0345;
    this.group.add(cover, paper, page);
    for (const m of [cover, paper]) m.castShadow = true;
    this.group.position.set(REST.x, TABLE.y, REST.z);
    this.group.rotation.y = REST.yaw;
    this.restP.copy(this.group.position);
    this.restQ.copy(this.group.quaternion);

    const entity = world.createTransformEntity(this.group as unknown as Object3D);
    entity.addComponent(RayInteractable);
    entity.addComponent(PokeInteractable);
    const target = this.group as unknown as {
      addEventListener: (t: string, f: () => void) => void;
      removeEventListener: (t: string, f: () => void) => void;
    };
    const toggle = () => notes.toggleReading();
    target.addEventListener('click', toggle);
    cleanup.push(() => target.removeEventListener('click', toggle));
    this.draw();
  }

  private wrap(): string[] {
    const ctx = this.ctx;
    ctx.font = FONT;
    const max = PAGE_W - MARGIN_X - 36;
    const lines: string[] = [];
    for (const para of notes.text.split('\n')) {
      let line = '';
      for (const word of para.split(/( )/)) {
        if (line && ctx.measureText(line + word).width > max) {
          lines.push(line.trimEnd());
          line = word.trimStart();
        } else line += word;
      }
      lines.push(line);
    }
    return lines;
  }

  /** Pinta la página (la última, o la que se esté leyendo). Solo redibuja si cambió algo visible. */
  private draw(): void {
    // cursor fijo: parpadearlo obligaba a repintar toda la página y a resubir su textura a la GPU cada 0,6 s,
    // y en el visor eso se notaba como un parpadeo periódico mirando al cuaderno
    const cursorOn = true;
    const title = bridge.view.page === 'meeting' ? bridge.view.title : '';
    const sig = `${notes.version}|${notes.page}|${cursorOn}|${title}|${notes.sync}`;
    if (sig === this.drawn) return;
    // al teclear deprisa se agrupan los cambios: como mucho ~8 repintados (y subidas a la GPU) por segundo
    const t = performance.now();
    if (t - this.drawnAt < 120) return;
    this.drawnAt = t;
    this.drawn = sig;

    const lines = this.wrap();
    const pages = Math.max(1, Math.ceil(lines.length / LINES_PER_PAGE));
    const now = notes.page === null ? pages - 1 : Math.min(notes.page, pages - 1);
    notes.pageCount = pages;
    notes.pageNow = now;

    const ctx = this.ctx;
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    // renglones y margen
    ctx.strokeStyle = 'rgba(80,110,180,.28)';
    ctx.lineWidth = 2;
    for (let y = TOP + 10; y < PAGE_H - 50; y += LINE_H) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(PAGE_W - 30, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(210,70,70,.45)';
    ctx.beginPath();
    ctx.moveTo(MARGIN_X - 14, 30);
    ctx.lineTo(MARGIN_X - 14, PAGE_H - 30);
    ctx.stroke();
    // cabecera
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1f2a44';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText('Notes', MARGIN_X, 74);
    ctx.fillStyle = '#7a8197';
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.fillText(title.slice(0, 34), MARGIN_X, 108);
    // texto
    ctx.fillStyle = '#1f2a44';
    ctx.font = FONT;
    const first = now * LINES_PER_PAGE;
    const visible = lines.slice(first, first + LINES_PER_PAGE);
    visible.forEach((l, i) => ctx.fillText(l, MARGIN_X, TOP + (i + 1) * LINE_H - 16));
    // cursor al final del texto, solo en la última página
    if (now === pages - 1 && cursorOn) {
      const li = visible.length - 1;
      const x = MARGIN_X + ctx.measureText(visible[li] ?? '').width + 3;
      ctx.fillRect(x, TOP + li * LINE_H + 6, 3, 36);
    }
    ctx.fillStyle = '#7a8197';
    ctx.font = '500 22px system-ui, sans-serif';
    if (pages > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(`${now + 1} / ${pages}`, PAGE_W - 36, PAGE_H - 28);
    }
    // estado de la copia en el servidor: discreto, abajo a la izquierda
    const state: Record<string, string> = { pending: 'unsaved…', saving: 'saving…', saved: 'saved', error: 'offline: will retry' };
    ctx.textAlign = 'left';
    ctx.fillStyle = notes.sync === 'error' ? '#c2410c' : '#7a8197';
    ctx.fillText(state[notes.sync] ?? '', MARGIN_X, PAGE_H - 28);
    this.tex.needsUpdate = true;
  }

  /** Cada fotograma: pinta la página y lleva el cuaderno a la mesa o a la altura de los ojos. */
  update(dt: number, camera: PerspectiveCamera): void {
    this.draw();
    if (notes.reading) {
      camera.getWorldPosition(this.pos);
      camera.getWorldQuaternion(this.qCam);
      this.fwd.set(0, 0, -1).applyQuaternion(this.qCam);
      this.down.set(0, -1, 0).applyQuaternion(this.qCam);
      this.goalP.copy(this.pos).addScaledVector(this.fwd, READ.dist).addScaledVector(this.down, READ.drop);
      // la página (su +Y) mira al CEO y su borde de arriba apunta hacia arriba
      this.goalQ.copy(this.qCam).multiply(rotX90);
    } else {
      this.goalP.copy(this.restP);
      this.goalQ.copy(this.restQ);
    }
    const k = 1 - Math.exp(-dt * 7);
    this.group.position.lerp(this.goalP, k);
    this.group.quaternion.slerp(this.goalQ, k);
    const s = this.group.scale.x + ((notes.reading ? READ.scale : 1) - this.group.scale.x) * k;
    this.group.scale.setScalar(s);
  }
}
