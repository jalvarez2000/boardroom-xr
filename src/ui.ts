import { BASE_URL } from './api.js';
import { Boardroom } from './boardroom.js';

const CSS = `
#br-ui{position:fixed;top:12px;left:12px;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;gap:8px;
 font:13px system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f4f5;background:rgba(18,22,30,.88);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:12px;z-index:10}
body.xr-active #br-ui{display:none}
#br-ui h3{margin:0;font-size:13px;letter-spacing:.08em;color:#f5d90a;font-weight:700}
#br-ui input,#br-ui select,#br-ui button{font:inherit;color:inherit;background:#222226;border:1px solid #3a3a42;border-radius:8px;padding:6px 8px}
#br-ui button{cursor:pointer}#br-ui button:hover{border-color:#6366f1}
#br-ui button.primary{background:#4f46e5;border-color:#4f46e5}
#br-ui button.rec{background:#dc2626;border-color:#dc2626}
#br-ui .row{display:flex;gap:6px;align-items:center}#br-ui .row>*{flex:1}#br-ui .row>button.sm{flex:0 0 auto;padding:4px 7px}
#br-ui ul{list-style:none;margin:0;padding:0;max-height:150px;overflow:auto;display:flex;flex-direction:column;gap:4px}
#br-ui li{display:flex;gap:4px;align-items:center;padding:4px 6px;border-radius:8px;background:#1b1b1f;border:1px solid transparent}
#br-ui li.sel{border-color:#6366f1}#br-ui li span{flex:1;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#br-log{overflow:auto;min-height:90px;max-height:240px;display:flex;flex-direction:column;gap:6px;padding:6px;background:#0f0f11;border-radius:8px}
#br-log div b{display:block;font-size:11px;color:#a1a1aa;font-weight:500}
#br-log .me{align-self:flex-end;text-align:right;color:#c7d2fe}
#br-err{color:#f87171;min-height:1em}
`;

export function mountUi(br: Boardroom): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement('div');
  root.id = 'br-ui';
  document.body.append(root);

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  let err = '';
  br.onError = (m) => {
    err = m;
    render();
  };

  function render() {
    // no re-renderizamos si el usuario está escribiendo en un input
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && root.contains(focused) && br.loggedIn) {
      return renderLog();
    }
    if (!br.loggedIn) {
      root.innerHTML = `<h3>BOARDROOM</h3>
        <input id="br-email" type="email" placeholder="Email" autocomplete="username">
        <input id="br-pass" type="password" placeholder="Contraseña" autocomplete="current-password">
        <button id="br-login" class="primary">Entrar</button>
        <small style="color:#a1a1aa">Servidor: ${esc(BASE_URL)}</small><div id="br-err">${esc(err)}</div>`;
      const go = async () => {
        err = '';
        try {
          await br.login(
            (root.querySelector('#br-email') as HTMLInputElement).value.trim(),
            (root.querySelector('#br-pass') as HTMLInputElement).value,
          );
        } catch (e) {
          err = (e as Error).message;
          render();
        }
      };
      root.querySelector('#br-login')?.addEventListener('click', go);
      root.querySelector('#br-pass')?.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && go());
      return;
    }

    root.innerHTML = `<div class="row"><h3>BOARDROOM</h3><button class="sm" id="br-out">Salir</button></div>
      <select id="br-co">${br.companies
        .map((c) => `<option value="${c.id}" ${c.id === br.company?.id ? 'selected' : ''}>${esc(c.name)}</option>`)
        .join('')}</select>
      <div class="row"><b style="flex:1">Reuniones</b><button class="sm primary" id="br-new">+ Nueva</button></div>
      <ul>${br.meetings
        .map(
          (m) => `<li class="${m.id === br.meeting?.id ? 'sel' : ''}"><span data-open="${m.id}">${esc(m.title)}</span>
           <button class="sm" data-ren="${m.id}" title="Renombrar">✎</button><button class="sm" data-del="${m.id}" title="Borrar">🗑</button></li>`,
        )
        .join('') || '<li style="color:#a1a1aa">Sin reuniones</li>'}</ul>
      <div id="br-log"></div>
      <div id="br-err">${esc(err)}</div>
      <div class="row"><input id="br-msg" placeholder="Escribe al comité…" ${br.meeting ? '' : 'disabled'}>
        <button class="sm primary" id="br-send">Enviar</button>
        <button class="sm ${br.mic ? 'rec' : ''}" id="br-mic" title="Hablar">🎤</button></div>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="br-voice" ${br.voiceEnabled ? 'checked' : ''} style="flex:0"> Los directores responden en voz</label>`;
    renderLog();

    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T | null;
    const run = (p: Promise<unknown>) =>
      p.catch((e) => {
        err = (e as Error).message;
        render();
      });
    q('#br-out')?.addEventListener('click', () => br.logout());
    q<HTMLSelectElement>('#br-co')?.addEventListener('change', (e) => run(br.selectCompany((e.target as HTMLSelectElement).value)));
    q('#br-new')?.addEventListener('click', () => run(br.newMeeting()));
    q('#br-mic')?.addEventListener('click', () => run(br.toggleMic()));
    q<HTMLInputElement>('#br-voice')?.addEventListener('change', (e) => (br.voiceEnabled = (e.target as HTMLInputElement).checked));
    const send = () => {
      const input = q<HTMLInputElement>('#br-msg');
      const text = input?.value.trim();
      if (input && text) {
        input.value = '';
        run(br.send(text));
      }
    };
    q('#br-send')?.addEventListener('click', send);
    q('#br-msg')?.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && send());
    root.querySelectorAll<HTMLElement>('[data-open]').forEach((el) =>
      el.addEventListener('click', () => run(br.selectMeeting(el.dataset.open as string))),
    );
    root.querySelectorAll<HTMLElement>('[data-ren]').forEach((el) =>
      el.addEventListener('click', () => {
        const id = el.dataset.ren as string;
        const cur = br.meetings.find((m) => m.id === id)?.title ?? '';
        const t = window.prompt('Nuevo nombre de la reunión', cur)?.trim();
        if (t) run(br.renameMeeting(id, t));
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-del]').forEach((el) =>
      el.addEventListener('click', () => {
        if (window.confirm('¿Borrar la reunión? También se elimina su resumen del contexto de los agentes.'))
          run(br.deleteMeeting(el.dataset.del as string));
      }),
    );
  }

  function renderLog() {
    const log = root.querySelector('#br-log');
    if (!log) return;
    log.innerHTML = br.transcript.length
      ? br.transcript.map((l) => `<div class="${l.me ? 'me' : ''}"><b>${esc(l.who)}</b>${esc(l.text || '…')}</div>`).join('')
      : '<span style="color:#a1a1aa">Abre una reunión y habla o escribe al comité.</span>';
    log.scrollTop = log.scrollHeight;
    const errEl = root.querySelector('#br-err');
    if (errEl) errEl.textContent = err;
  }

  br.onChange = () => {
    err = '';
    render();
  };
  render();
}
