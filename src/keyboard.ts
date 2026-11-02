import { type Object3D, PokeInteractable, RayInteractable, type World } from '@iwsdk/core';
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { notes } from './notes.js';
import { agentEditor } from './agent-editor.js';
import { TABLE } from './room.js';

/** Teclado virtual sobre la mesa, delante de la tablet: una superficie con teclas de 3,5 cm (más de 3° para la mirada). */
/** Teclado del sistema de las gafas (WebXR `session.isSystemKeyboardSupported`); `?syskb=0` obliga a usar el de la mesa. */
const SYSTEM_KEYBOARD_OFF = (() => {
  try {
    return new URLSearchParams(location.search).get('syskb') === '0' || localStorage.getItem('boardroom.syskb') === '0';
  } catch {
    return false;
  }
})();

export const KEYBOARD = { x: 0, z: -0.37, w: 0.42, tiltDeg: 7 };

const UNIT = 100;
const MARGIN = 20;
const W = 11.5 * UNIT + MARGIN * 2;
const H = 5 * UNIT + MARGIN * 2;

type Action = 'char' | 'back' | 'enter' | 'shift' | 'accent' | 'read' | 'space';
interface Key {
  id: string;
  /** lo que se teclea (y se rotula) sin y con ⇧ */
  ch: string;
  shifted?: string;
  w: number;
  action: Action;
  x: number;
  y: number;
}

interface Def {
  ch: string;
  shifted?: string;
  w?: number;
  action?: Action;
}
const chars = (letters: string): Def[] => [...letters].map((ch) => ({ ch }));

const ROWS: Def[][] = [
  [...chars('1234567890'), { ch: '⌫', w: 1.5, action: 'back' }],
  [...chars('qwertyuiop'), { ch: '´', w: 1.5, action: 'accent' }],
  [...chars('asdfghjkl'), { ch: "'", shifted: '"' }, { ch: '⏎', w: 1.5, action: 'enter' }],
  [{ ch: '⇧', w: 1.5, action: 'shift' }, ...chars('zxcvbnm'), { ch: ',', shifted: ';' }, { ch: '.', shifted: ':' }, { ch: '?', shifted: '!' }],
  [{ ch: 'Read', w: 2.5, action: 'read' }, { ch: 'space', w: 9, action: 'space' }],
];

const KEYS: Key[] = [];
ROWS.forEach((row, r) => {
  let x = MARGIN;
  row.forEach((k, i) => {
    const w = (k.w ?? 1) * UNIT;
    KEYS.push({ id: `${r}-${i}`, ch: k.ch, shifted: k.shifted, w, action: k.action ?? 'char', x, y: MARGIN + r * UNIT });
    x += w;
  });
});

/**
 * Superficie de teclas con detección por UV (como la pizarra): la mirada resalta la tecla, el pellizco o el dedo la teclean.
 * Lo escrito va a `notes`, que lo pinta en el cuaderno.
 */
export class VirtualKeyboard {
  readonly group = new Group();
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private hover: Key | null = null;
  private pressed: Key | null = null;
  private pressedAt = 0;
  private drawn = '';
  private audio: AudioContext | null = null;
  private world: World;
  /** se teclea con el teclado del sistema (esta superficie solo lo abre) */
  private sys = false;
  private sysInput: HTMLInputElement | null = null;
  private sysBase = '';
  private keyW = 0;
  private keyH = 0;
  private hoverMesh!: Mesh;
  private flashMesh!: Mesh;

  private overlay(color: number, opacity: number): Mesh {
    const m = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.0006;
    m.renderOrder = 3;
    m.visible = false;
    return m;
  }

  /** Coloca un resaltado sobre una tecla (o lo oculta). */
  private mark(m: Mesh, k: Key | null): void {
    m.visible = !!k;
    if (!k) return;
    m.position.x = ((k.x + k.w / 2) / W - 0.5) * this.keyW;
    m.position.z = ((k.y + UNIT / 2) / H - 0.5) * this.keyH;
    m.scale.set(((k.w - 10) / W) * this.keyW, ((UNIT - 10) / H) * this.keyH, 1);
  }

  constructor(world: World, cleanup: (() => void)[]) {
    this.world = world;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 8;
    cleanup.push(() => this.tex.dispose());

    const h = (KEYBOARD.w * H) / W;
    const tilt = (KEYBOARD.tiltDeg * Math.PI) / 180;
    const base = new Mesh(new BoxGeometry(KEYBOARD.w + 0.02, 0.012, h + 0.02), new MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.4 }));
    base.position.y = -0.007;
    const keys = new Mesh(new PlaneGeometry(KEYBOARD.w, h), new MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    keys.rotation.x = -Math.PI / 2;
    this.group.add(base, keys);
    // resaltados de «tecla mirada» y «tecla pulsada»: planos encima de las teclas. Repintar el canvas entero (1190x540) y
    // resubirlo a la GPU cada vez que una mano o un rayo pasa por una tecla provocaba parpadeos en el visor
    this.keyW = KEYBOARD.w;
    this.keyH = h;
    this.hoverMesh = this.overlay(0xffffff, 0.2);
    this.flashMesh = this.overlay(0x4f46e5, 0.95);
    this.group.add(this.hoverMesh, this.flashMesh);
    // como un teclado real: el borde cercano apoyado en la mesa y el lejano algo más alto, con un pie debajo
    this.group.rotation.x = tilt;
    const footH = h * Math.sin(tilt) + 0.006;
    const foot = new Mesh(new BoxGeometry(KEYBOARD.w + 0.02, footH, 0.025), base.material);
    foot.position.set(0, -0.013 - footH / 2 + 0.006, -h / 2 + 0.008);
    this.group.add(foot);
    this.group.position.set(KEYBOARD.x, TABLE.y + 0.0135 + (h / 2) * Math.sin(tilt), KEYBOARD.z);

    const entity = world.createTransformEntity(this.group as unknown as Object3D);
    entity.addComponent(RayInteractable);
    entity.addComponent(PokeInteractable);
    this.listen(keys, cleanup);
    this.draw();
  }

  private keyAt(e: { uv?: { x: number; y: number } }): Key | null {
    if (!e.uv) return null;
    const x = e.uv.x * W;
    const y = (1 - e.uv.y) * H;
    return KEYS.find((k) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + UNIT) ?? null;
  }

  private listen(mesh: Mesh, cleanup: (() => void)[]): void {
    type Ev = { uv?: { x: number; y: number } };
    const target = mesh as unknown as {
      addEventListener: (t: string, f: (e: never) => void) => void;
      removeEventListener: (t: string, f: (e: never) => void) => void;
    };
    const move = (e: Ev) => {
      this.warmAudio();
      this.setHover(this.keyAt(e));
    };
    const leave = () => this.setHover(null);
    // se teclea al pellizcar (no al soltar), sobre la tecla que se mira en ese instante
    const down = (e: Ev) => {
      if (this.sys) {
        this.openSystem();
        return;
      }
      const k = this.keyAt(e) ?? this.hover;
      if (k) this.press(k);
    };
    for (const [t, f] of [['pointerenter', move], ['pointermove', move], ['pointerleave', leave], ['pointerdown', down]] as [string, (e: Ev) => void][]) {
      target.addEventListener(t, f as (e: never) => void);
      cleanup.push(() => target.removeEventListener(t, f as (e: never) => void));
    }
  }

  private setHover(k: Key | null): void {
    if (k === this.hover) return;
    this.hover = k;
    this.mark(this.hoverMesh, this.sys ? null : k);
  }

  private press(k: Key): void {
    this.pressed = k;
    this.pressedAt = performance.now();
    this.mark(this.flashMesh, k);
    this.click();
    // con el editor de un director abierto, el teclado escribe su nombre
    if (agentEditor.open && ['char', 'space', 'back', 'enter'].includes(k.action)) {
      if (k.action === 'back') agentEditor.backspace();
      else if (k.action === 'enter') void agentEditor.commit();
      else agentEditor.type(notes.compose(k.action === 'space' ? ' ' : notes.shift && k.shifted ? k.shifted : k.ch));
      this.draw();
      return;
    }
    switch (k.action) {
      case 'char':
        notes.type(notes.shift && k.shifted ? k.shifted : k.ch);
        break;
      case 'space':
        notes.type(' ');
        break;
      case 'back':
        notes.backspace();
        break;
      case 'enter':
        notes.newline();
        break;
      case 'shift':
        notes.toggleShift();
        break;
      case 'accent':
        notes.toggleAccent();
        break;
      case 'read':
        notes.toggleReading();
        break;
    }
    this.draw();
  }

  /** Crea el contexto de audio al primer roce de una mano (crearlo al primer pellizco provocaba un tirón al teclear). */
  private warmAudio(): void {
    try {
      this.audio ??= new AudioContext();
    } catch {
      // sin audio
    }
  }

  /** Tic suave al teclear (sin ficheros de audio). */
  private click(): void {
    try {
      this.audio ??= new AudioContext();
      const t = this.audio.currentTime;
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.frequency.value = 1900;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      osc.connect(gain).connect(this.audio.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    } catch {
      // sin audio
    }
  }

  /** Redibuja solo si algo visible cambió (tecla mirada, pulsada, ⇧, ´, Leer). */
  private draw(): void {
    const sig = `${notes.shift}|${notes.accent}|${notes.reading}|${this.sys}`;
    if (sig === this.drawn) return;
    this.drawn = sig;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1b1d22';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 34);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const k of KEYS) {
      const on = (k.action === 'shift' && notes.shift) || (k.action === 'accent' && notes.accent) || (k.action === 'read' && notes.reading);
      const special = k.action !== 'char' && k.action !== 'space';
      ctx.fillStyle = on ? '#f5d90a' : special ? '#232733' : '#2c3140';
      ctx.beginPath();
      ctx.roundRect(k.x + 5, k.y + 5, k.w - 10, UNIT - 10, 16);
      ctx.fill();
      ctx.fillStyle = on ? '#1b1d22' : '#e4e4e7';
      const label = k.action === 'read' ? (notes.reading ? 'Close' : 'Read') : notes.shift && k.shifted ? k.shifted : notes.shift && k.action === 'char' ? k.ch.toUpperCase() : k.ch;
      ctx.font = `${k.action === 'char' && label.length === 1 ? 600 : 500} ${k.action === 'char' ? 46 : 34}px system-ui, sans-serif`;
      ctx.fillText(label, k.x + k.w / 2, k.y + UNIT / 2 + 3);
    }
    if (this.sys) {
      // con el teclado del sistema, esta superficie es solo el botón que lo abre
      ctx.fillStyle = 'rgba(27,29,34,.88)';
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 34);
      ctx.fill();
      ctx.fillStyle = '#f5d90a';
      ctx.font = '700 84px system-ui, sans-serif';
      ctx.fillText('Tap to type', W / 2, H / 2 - 34);
      ctx.fillStyle = '#c7ccd9';
      ctx.font = '500 44px system-ui, sans-serif';
      ctx.fillText('Opens the glasses keyboard', W / 2, H / 2 + 56);
    }
    this.tex.needsUpdate = true;
  }

  /** Abre el teclado del sistema: cada apertura es una sesión de edición nueva y su campo parte vacío. */
  private openSystem(): void {
    if (!this.sysInput) {
      const i = document.createElement('input');
      i.type = 'text';
      i.autocomplete = 'off';
      i.setAttribute('autocapitalize', 'sentences');
      // debe estar en el DOM y dentro de la ventana, pero no se ve
      i.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;border:0;padding:0;pointer-events:none';
      i.oninput = () => {
        if (agentEditor.open) agentEditor.setName(i.value);
        else notes.setText(this.sysBase + i.value);
      };
      i.onblur = () => {
        if (agentEditor.open) void agentEditor.commit();
      };
      document.body.appendChild(i);
      this.sysInput = i;
    }
    // las notas siguen donde se quedaron; el nombre de un director se escribe entero
    this.sysBase = agentEditor.open || !notes.text || /[\s\n]$/.test(notes.text) ? notes.text : `${notes.text} `;
    this.sysInput.value = '';
    this.sysInput.focus();
    this.click();
  }

  /** Cada fotograma: apaga el destello de la tecla pulsada y refleja cambios de ⇧ / Leer hechos desde fuera. */
  update(): void {
    const session = this.world.renderer.xr.getSession() as (XRSession & { isSystemKeyboardSupported?: boolean }) | null;
    const sys = !!session?.isSystemKeyboardSupported && !SYSTEM_KEYBOARD_OFF;
    if (sys !== this.sys) {
      this.sys = sys;
      if (sys) this.mark(this.hoverMesh, null);
      this.draw();
    }
    if (!session && this.sysInput) {
      this.sysInput.remove();
      this.sysInput = null;
    }
    if (this.pressed && performance.now() - this.pressedAt >= 140) {
      this.pressed = null;
      this.mark(this.flashMesh, null);
    }
    this.draw();
  }
}
