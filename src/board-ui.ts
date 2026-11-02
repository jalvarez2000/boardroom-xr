import type { Object3D, UIKit, UIKitMLAsset, World } from '@iwsdk/core';
import { board } from './whiteboard.js';
import { tutorial } from './tutorial.js';

const fold = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡]/g, '')
    .replace(/[·•—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'");

type BarKind = 'wall' | 'tablet' | 'near';

/** Botonera 3D de la pizarra (páginas, zoom, cerca, descargar, tablet, ayuda): en la pared, en la tablet y junto a la tarjeta cercana. */
export class BoardUi {
  private bars: { root: Object3D; caption?: UIKit.Text; kind: BarKind }[] = [];
  private version = -1;

  constructor(world: World, cleanup: (() => void)[]) {
    for (const [id, kind] of [['board-bar-wall', 'wall'], ['board-bar-tablet', 'tablet'], ['board-bar-near', 'near']] as const) {
      const panel = world.getSceneObject<UIKitMLAsset>(id);
      if (!panel) continue;
      const click = (el: string, fn: () => void) => {
        const e = panel.getElementById(el);
        e?.addEventListener('click', fn);
        if (e) cleanup.push(() => e.removeEventListener('click', fn));
      };
      click('bb-prev', () => board.step(-1));
      click('bb-next', () => board.step(1));
      click('bb-download', () => void board.download());
      click('bb-tablet', () => board.toggleTablet());
      click('bb-zoomin', () => board.zoomBy(1));
      click('bb-zoomout', () => board.zoomBy(-1));
      click('bb-near', () => board.toggleNear());
      click('bb-help', () => tutorial.open());
      this.bars.push({
        root: panel as unknown as Object3D,
        caption: panel.getElementById<UIKit.Text>('bb-caption') ?? undefined,
        kind,
      });
    }
  }

  sync(inXr: boolean): void {
    const has = board.pages.length > 0;
    for (const b of this.bars) {
      const show = b.kind === 'near' ? board.near && !board.onTablet : b.kind === 'tablet' ? board.onTablet : !board.near && !board.onTablet;
      b.root.visible = inXr && has && show;
    }
    if (this.version === board.version) return;
    this.version = board.version;
    const text = fold(board.error || board.caption).slice(0, 40);
    for (const b of this.bars) b.caption?.setProperties({ text });
  }
}
