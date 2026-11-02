import type { Object3D, UIKit, UIKitMLAsset, World } from '@iwsdk/core';
import { agentEditor } from './agent-editor.js';
import { bridge } from './bridge.js';

/** La fuente del panel 3D no trae acentos: se pliegan a ASCII. */
const ascii = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿¡]/g, '');

/** Panel 3D del editor de directores (nombre y sexo). El nombre se escribe con el teclado de la mesa. */
export class AgentEditorUi {
  private root: Object3D | undefined;
  private text = new Map<string, UIKit.Text>();
  private shown = new Map<string, string>();
  private version = -1;
  private blink = -1;

  constructor(world: World, cleanup: (() => void)[]) {
    const panel = world.getSceneObject<UIKitMLAsset>('agent-editor-panel');
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
    for (const id of ['ae-role', 'ae-name', 'ae-error', 'ae-female-label', 'ae-male-label', 'ae-save-label']) el(id);
    click('ae-female', () => agentEditor.setFemale(true));
    click('ae-male', () => agentEditor.setFemale(false));
    click('ae-cancel', () => agentEditor.cancel());
    click('ae-save', () => void agentEditor.commit());
  }

  sync(inXr: boolean): void {
    if (!this.root) return;
    this.root.visible = inXr && agentEditor.open;
    if (!this.root.visible) return;
    const cursor = Math.floor(performance.now() / 500) % 2 === 0 ? '_' : ' ';
    if (this.version === agentEditor.version && this.blink === (cursor === '_' ? 1 : 0)) return;
    this.version = agentEditor.version;
    this.blink = cursor === '_' ? 1 : 0;
    const a = bridge.agents.find((x) => x.id === agentEditor.agentId);
    this.set('ae-role', { text: ascii(a?.title ?? '') });
    this.set('ae-name', { text: ascii(agentEditor.name) + cursor });
    this.set('ae-female-label', { text: `${agentEditor.female ? '(x)' : '( )'} Female` });
    this.set('ae-male-label', { text: `${agentEditor.female ? '( )' : '(x)'} Male` });
    this.set('ae-error', { text: ascii(agentEditor.error).slice(0, 80) || ' ' });
    this.set('ae-save-label', { text: agentEditor.saving ? 'Saving...' : 'Save' });
  }

  private set(id: string, props: { text?: string }): void {
    const key = JSON.stringify(props);
    if (this.shown.get(id) === key) return;
    this.shown.set(id, key);
    this.text.get(id)?.setProperties(props);
  }
}
