import type { Object3D, UIKit, UIKitMLAsset, World } from '@iwsdk/core';
import { bridge } from './bridge.js';
import { board } from './whiteboard.js';
import { agentEditor } from './agent-editor.js';

/** La fuente por defecto de UIKit no trae acentos, ñ ni signos tipográficos: se pliegan a ASCII. */
const ascii = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡]/g, '')
    .replace(/[·•]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'");

const clip = (t: string, n: number) => (t.length > n ? `...${t.slice(-n)}` : t);

const MEETING_SLOTS = 3;
const DOC_SLOTS = 3;

/** Interfaz de la tablet dentro de XR: el equivalente 3D del popup DOM (login, reuniones y reunión abierta). */
export class TabletUi {
  private root: Object3D | undefined;
  private text = new Map<string, UIKit.Text>();
  private shown = new Map<string, string>();
  private viewVersion = -1;

  constructor(world: World, cleanup: (() => void)[]) {
    const panel = world.getSceneObject<UIKitMLAsset>('tablet-panel');
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
    for (const id of ['title', 'status', 'list-help', 'page-login', 'page-list', 'page-meeting', 'page-docs', 'docs-help', 'log', 'mic-label', 'voice-label', 'docs-label']) el(id);
    for (let i = 0; i < DOC_SLOTS; i++) {
      el(`d${i}-label`);
      click(`d${i}`, () => {
        const d = bridge.view.docs[i];
        if (d) bridge.onToggleDocScope(d.id);
      });
      click(`d${i}-del`, () => {
        const d = bridge.view.docs[i];
        if (d) bridge.onDeleteDoc(d.id);
      });
    }
    click('docs-btn', () => bridge.onOpenDocs());
    click('docs-back', () => bridge.onCloseDocs());
    click('docs-prev', () => bridge.onDocsPage(-1));
    click('docs-next', () => bridge.onDocsPage(1));
    click('docs-up', () => bridge.onUploadDocs());
    for (let i = 0; i < MEETING_SLOTS; i++) {
      el(`m${i}-label`);
      click(`m${i}`, () => {
        const m = bridge.view.meetings[i];
        if (m) bridge.onOpenMeeting(m.id);
      });
    }
    click('new-btn', () => bridge.onNewMeeting());
    click('back-btn', () => bridge.onBack());
    click('voice-btn', () => bridge.onToggleVoice());
    click('mic-btn', () => bridge.onMic());
  }

  /** Solo se actualiza lo que cambia; fuera de XR el panel se oculta (manda el popup DOM). */
  sync(inXr: boolean): void {
    if (!this.root) return;
    // con la presentación en la tablet, su pantalla es la página (y la botonera de la pizarra)
    this.root.visible = inXr && !(board.onTablet && board.pages.length > 0) && !agentEditor.open;
    if (!inXr) return;
    const v = bridge.view;
    if (this.viewVersion !== bridge.viewVersion) {
      this.viewVersion = bridge.viewVersion;
      this.set('page-login', { display: v.page === 'login' ? 'flex' : 'none' });
      this.set('page-list', { display: v.page === 'list' ? 'flex' : 'none' });
      this.set('page-meeting', { display: v.page === 'meeting' ? 'flex' : 'none' });
      this.set('page-docs', { display: v.page === 'docs' ? 'flex' : 'none' });
      this.set('docs-label', { text: `Docs (${v.docCount})` });
      this.set('docs-help', {
        text: v.docCount ? `${v.docPage + 1}/${v.docPages} · tap to change scope` : 'No documents yet. Upload the first one',
      });
      this.set('docs-prev', { display: v.docPage > 0 ? 'flex' : 'none' });
      this.set('docs-next', { display: v.docPage < v.docPages - 1 ? 'flex' : 'none' });
      for (let i = 0; i < DOC_SLOTS; i++) {
        const d = v.docs[i];
        this.set(`d${i}-label`, { text: ascii(clip(`${d?.name ?? '-'} · ${d ? (d.global ? 'All' : 'Here only') : ''}`, 40)) });
        this.set(`d${i}`, { display: d ? 'flex' : 'none' });
        this.set(`d${i}-del`, { display: d ? 'flex' : 'none' });
      }
      this.set('title', { text: ascii(clip(v.title, 40)) });
      this.set('list-help', { text: v.meetings.length ? 'Tap a meeting to join:' : 'No meetings yet. Create the first one:' });
      for (let i = 0; i < MEETING_SLOTS; i++) {
        const m = v.meetings[i];
        this.set(`m${i}-label`, { text: ascii(clip(m?.title ?? '-', 44)) });
        this.set(`m${i}`, { display: m ? 'flex' : 'none' });
      }
      this.set('voice-label', { text: v.voice ? 'Voice: on' : 'Voice: off' });
    }
    const partial = bridge.micActive && bridge.subtitle ? `\n> ${bridge.subtitle}` : '';
    this.set('log', { text: ascii(clip((v.log || 'Just speak to address the committee.') + partial, 330)) });
    this.set('status', { text: ascii(clip(bridge.status, 60)) });
    this.set('mic-label', { text: bridge.micActive ? 'Listening...' : v.listening ? 'Mic on' : 'Muted' });
  }

  private set(id: string, props: { text?: string; display?: 'flex' | 'none' }): void {
    const key = JSON.stringify(props);
    if (this.shown.get(id) === key) return;
    this.shown.set(id, key);
    this.text.get(id)?.setProperties(props);
  }
}
