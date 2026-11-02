import type { Object3D, UIKit, UIKitMLAsset, World } from '@iwsdk/core';
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { ART_H, ART_W, drawGestureArt } from './gesture-art.js';
import { STEPS, tutorial } from './tutorial.js';

/** La fuente del panel 3D no trae acentos ni signos tipográficos: se pliegan a ASCII. */
const ascii = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .replace(/[«»“”]/g, '"')
    .replace(/…/g, '...');

/** Panel 3D del tutorial de gestos (dentro de XR). Se maneja con mirada + pellizco o con los propios gestos. */
const ART_INTERVAL_MS = 80;

export class TutorialUi {
  private root: Object3D | undefined;
  private text = new Map<string, UIKit.Text>();
  private shown = new Map<string, string>();
  private version = -1;
  private artAt = 0;
  private art = document.createElement('canvas');
  private artTex: CanvasTexture;
  private artCtx: CanvasRenderingContext2D;
  private quad: Mesh | undefined;
  private slot: Object3D | undefined;
  private pos = new Vector3();
  private rot = new Quaternion();
  private zOffset = new Vector3();

  constructor(world: World, cleanup: (() => void)[]) {
    this.art.width = ART_W;
    this.art.height = ART_H;
    this.artCtx = this.art.getContext('2d') as CanvasRenderingContext2D;
    this.artTex = new CanvasTexture(this.art);
    this.artTex.colorSpace = SRGBColorSpace;
    cleanup.push(() => this.artTex.dispose());
    const panel = world.getSceneObject<UIKitMLAsset>('tutorial-panel');
    this.root = panel as unknown as Object3D | undefined;
    if (!panel) return;
    const el = (id: string) => {
      const e = panel.getElementById<UIKit.Text>(id);
      if (e) this.text.set(id, e);
      return e;
    };
    const click = (id: string, fn: () => void) => {
      const e = el(id);
      e?.addEventListener('click', fn);
      if (e) cleanup.push(() => e.removeEventListener('click', fn));
    };
    for (const id of ['tu-title', 'tu-body', 'tu-try', 'tu-dots', 'tu-next-label', 'tu-never-label']) el(id);
    // la ilustración animada es una lámina suelta colocada sobre su hueco del panel (UIKit solo admite hijos UIKit)
    this.slot = (panel.getElementById('tu-art') as unknown as Object3D | null) ?? undefined;
    this.quad = new Mesh(new PlaneGeometry(1, ART_H / ART_W), new MeshBasicMaterial({ map: this.artTex, transparent: true, toneMapped: false }));
    this.quad.visible = false;
    world.scene.add(this.quad);
    cleanup.push(() => this.quad?.removeFromParent());
    click('tu-prev', () => tutorial.prev());
    click('tu-next', () => tutorial.next());
    click('tu-never', () => tutorial.toggleDontShow());
    click('tu-skip', () => tutorial.close());
  }

  sync(inXr: boolean): void {
    if (!this.root) return;
    this.root.visible = inXr && tutorial.visible;
    if (this.quad) this.quad.visible = this.root.visible && !!this.slot;
    if (!inXr || !tutorial.visible) return;
    // la mano 3D se renderiza en un segundo contexto WebGL y se copia a un canvas 2D: en el visor eso
    // por cada frame provoca tirones, así que la ilustración se refresca a ~12 fps
    const now = performance.now();
    if (now - this.artAt >= ART_INTERVAL_MS) {
      this.artAt = now;
      drawGestureArt(this.artCtx, tutorial.step, now / 1000);
      this.artTex.needsUpdate = true;
    }
    if (this.quad && this.slot) {
      // el hueco mide 200 unidades UIKit de ancho (2 m locales) y hereda la escala del panel
      this.slot.getWorldPosition(this.pos);
      this.root.getWorldQuaternion(this.rot);
      this.quad.position.copy(this.pos).add(this.zOffset.set(0, 0, 0.004).applyQuaternion(this.rot));
      this.quad.quaternion.copy(this.rot);
      this.quad.scale.setScalar(this.root.scale.x * 1.92); // un pelín menos que el hueco, para no pisar el texto
    }
    if (this.version === tutorial.version) return;
    this.version = tutorial.version;
    const s = tutorial.current;
    const done = tutorial.done.has(tutorial.step);
    this.set('tu-title', { text: ascii(s.title) });
    this.set('tu-body', { text: ascii(s.body) });
    this.set('tu-try', { text: s.tryGesture ? (done ? 'Well done!' : ascii(s.tryText ?? '')) : ' ' });
    this.set('tu-dots', { text: `${tutorial.step + 1} / ${STEPS.length}` });
    this.set('tu-next-label', { text: tutorial.last ? 'Start' : 'Next' });
    this.set('tu-never-label', { text: `${tutorial.dontShow ? '[x]' : '[ ]'} Don't show again` });
  }

  private set(id: string, props: { text?: string; display?: 'flex' | 'none' }): void {
    const key = JSON.stringify(props);
    if (this.shown.get(id) === key) return;
    this.shown.set(id, key);
    this.text.get(id)?.setProperties(props);
  }
}
