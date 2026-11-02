import { BASE_URL } from './api.js';
import { bridge } from './bridge.js';
import { Boardroom } from './boardroom.js';
import { board } from './whiteboard.js';
import { STEPS, tutorial } from './tutorial.js';
import { agentEditor } from './agent-editor.js';
import { ART_H, ART_W, drawGestureArt } from './gesture-art.js';

const CSS = `
#br-ui{position:fixed;top:12px;left:12px;width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;gap:8px;
 font:13px system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f4f5;background:rgba(18,22,30,.88);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:12px;z-index:10}
body.xr-active #br-ui{display:none}
/* acoplado a la tablet de la mesa: MeetingSystem le aplica un matrix3d que lo asienta sobre la pantalla 3D */
#br-ui.docked{top:0;left:0;width:560px;height:382px;max-height:none;max-width:none;box-sizing:border-box;transform-origin:0 0;
 background:#12161e;backdrop-filter:none;border-radius:10px;border-color:rgba(255,255,255,.08);overflow:hidden}
#br-ui.docked #br-log{flex:1;min-height:0;max-height:none}
#br-ui.docked ul{max-height:84px}
#br-board{background:#1b2a46;border-radius:8px;padding:4px 6px}
#br-board .cap{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:12px;color:#c7d6f3}
#br-board .row>*{flex:0 0 auto}
#br-bc{width:100%;border-radius:8px;display:block}
#br-ui.present>*:not(#br-board):not(#br-bc-wrap){display:none}
#br-ui.docked:has(#br-login){justify-content:center;padding:28px 56px;gap:12px}
#br-ui.docked:has(#br-login) h3{font-size:18px;text-align:center}
#br-ui.docked:has(#br-login) input,#br-ui.docked:has(#br-login) button{padding:11px 12px;font-size:15px}
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
#br-tut{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(5,7,12,.62);font:15px system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f4f5}
body.xr-active #br-tut{display:none}
#br-tut .card{width:min(720px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#12161e;border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px}
#br-tut .main{display:flex;gap:20px;align-items:center;flex-wrap:wrap}#br-tut .main .text{flex:1 1 260px;display:flex;flex-direction:column;gap:12px}
#br-tut canvas{flex:0 0 auto;width:300px;max-width:100%;aspect-ratio:400/340;border-radius:16px}
#br-tut .eyebrow{color:#f5d90a;font-size:11px;font-weight:700;letter-spacing:.14em}
#br-tut h2{margin:0;font-size:21px}
#br-tut p{margin:0;line-height:1.45;color:#e4e4e7;min-height:5.8em}
#br-tut .try{color:#a1a1aa;min-height:1.3em}#br-tut .try.ok{color:#4ade80}
#br-tut .row{display:flex;gap:8px;align-items:center}#br-tut .row .grow{flex:1}
#br-tut button{font:inherit;color:inherit;background:#222226;border:1px solid #3a3a42;border-radius:10px;padding:10px 14px;cursor:pointer;min-height:44px}
#br-tut button.primary{background:#4f46e5;border-color:#4f46e5}
#br-ae{position:fixed;inset:0;z-index:31;display:flex;align-items:center;justify-content:center;background:rgba(5,7,12,.62);font:15px system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f4f5}
body.xr-active #br-ae{display:none}
#br-ae .card{width:min(420px,calc(100vw - 32px));background:#12161e;border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:12px}
#br-ae .eyebrow{color:#f5d90a;font-size:11px;font-weight:700;letter-spacing:.14em}
#br-ae input[type=text]{font:inherit;color:inherit;background:#222226;border:1px solid #3a3a42;border-radius:10px;padding:12px;font-size:18px}
#br-ae .row{display:flex;gap:8px;align-items:center}#br-ae .row>*{flex:1}
#br-ae label{display:flex;gap:8px;align-items:center;padding:10px;border:1px solid #3a3a42;border-radius:10px;cursor:pointer}
#br-ae button{font:inherit;color:inherit;background:#222226;border:1px solid #3a3a42;border-radius:10px;padding:10px 14px;cursor:pointer;min-height:44px}
#br-ae button.primary{background:#4f46e5;border-color:#4f46e5}
#br-ae .err{color:#f87171;min-height:1.3em}
#br-tut .dots{flex:1;text-align:center;color:#a1a1aa;font-size:13px}
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
  // documentos: panel abierto, fichero elegido y alcance (por defecto, todas las reuniones)
  let docsOpen = false;
  let pendingFile: File | null = null;
  let onlyHere = false;
  br.onError = (m) => {
    err = m;
    bridge.status = m;
    render();
  };

  /** Sección «Documentos» de la reunión: lista con alcance y borrado, y formulario de subida. */
  function docsHtml(): string {
    if (br.uploadOpen) docsOpen = true; // «Subir» desde XR abre el formulario al volver a la pantalla
    const form = br.uploadOpen
      ? `<div id="br-upform">
          ${pendingFile ? `<div class="row"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${esc(pendingFile.name)}</span><button class="sm" id="br-doc-change">Change</button></div>` : '<input type="file" id="br-file" accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.html,.htm,.yaml,.yml,.log,application/pdf,text/*">'}
          <small style="color:#a1a1aa">By default the document is used in <b>all meetings</b> of the company (max. 4 MB; PDF, TXT, MD, CSV, JSON…).</small>
          <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="br-onlyhere" ${onlyHere ? 'checked' : ''} style="flex:0"> Only in this meeting</label>
          <div class="row"><button class="sm primary" id="br-doc-send" ${pendingFile ? '' : 'disabled'}>Upload</button><button class="sm" id="br-doc-cancel">Cancel</button></div>
        </div>`
      : '';
    const list = docsOpen
      ? `<ul>${
          br.docs
            .map(
              (d) => `<li><span title="${esc(d.name)}${d.indexedAt ? '' : ' · not indexed'}">${esc(d.name)}</span>
                <button class="sm ${d.scope === 'global' ? '' : 'primary'}" data-scope="${d.id}" title="Change the document scope">${d.scope === 'global' ? 'All meetings' : 'Only this meeting'}</button>
                <button class="sm" data-deldoc="${d.id}" title="Delete (also from Blob)">🗑</button></li>`,
            )
            .join('') || '<li style="color:#a1a1aa">No documents yet.</li>'
        }</ul>`
      : '';
    return `<div id="br-docs"><div class="row"><button class="sm" id="br-doctoggle" style="text-align:left">${docsOpen ? '▾' : '▸'} Documents (${br.docs.length})</button>
      <button class="sm" id="br-docup" style="flex:0 0 auto">＋ Upload</button></div>${form}${list}</div>`;
  }

  function render() {
    // no se re-renderiza mientras se escribe un mensaje al comité (se perdería lo escrito)...
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement && focused.id === 'br-msg' && root.contains(focused) && br.loggedIn) {
      return renderLog();
    }
    // ...pero sí al entrar: el foco se queda en el campo de la contraseña (Enter, o un clic en Safari, que no da foco
    // al botón) y, si no, la pantalla de login no se sustituía y se quedaba en «Entrando…»
    if (!br.loggedIn) {
      root.innerHTML = `<h3>BOARDROOM</h3>
        <input id="br-email" type="email" placeholder="Email" autocomplete="username">
        <input id="br-pass" type="password" placeholder="Password" autocomplete="current-password">
        <button id="br-login" class="primary">Sign in</button>
        <small style="color:#a1a1aa">Server: ${esc(BASE_URL)}</small><div id="br-err">${esc(err)}</div>`;
      let entering = false;
      const go = async () => {
        if (entering) return;
        entering = true;
        err = '';
        const btn = root.querySelector<HTMLButtonElement>('#br-login');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Signing in…';
        }
        try {
          const field = (id: string) => root.querySelector<HTMLInputElement>(id)?.value ?? '';
          let email = field('#br-email').trim();
          let pass = field('#br-pass');
          // Chrome no entrega a la página una contraseña autocompletada hasta el primer gesto del usuario:
          // en el primer clic llega vacía, así que se relee un instante después en vez de fallar.
          if (!email || !pass) {
            await new Promise((r) => setTimeout(r, 300));
            email = field('#br-email').trim();
            pass = field('#br-pass');
          }
          await br.login(email, pass);
        } catch (e) {
          err = (e as Error).message;
          render();
        } finally {
          entering = false;
        }
      };
      root.querySelector('#br-login')?.addEventListener('click', go);
      root.querySelector('#br-pass')?.addEventListener('keydown', (e) => (e as KeyboardEvent).key === 'Enter' && go());
      return;
    }

    const inMeeting = !!br.meeting;
    const head = inMeeting
      ? `<div class="row"><button class="sm" id="br-back" title="Back to meetings">‹ Meetings</button>
          <h3 style="flex:2;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(br.meeting?.title ?? '')}</h3>
          <button class="sm" id="br-addag" title="Add a director">+ Agent</button></div>
         <div id="br-agpick" style="display:none"></div>
         <ul>${
           br.participants
             .map(
               (a) => `<li><span>${esc(a.name)} · ${esc(a.title)}</span><button class="sm" data-unseat="${a.id}" title="Remove from the table">✕</button></li>`,
             )
             .join('') || '<li style="color:#a1a1aa">Empty table: add a director with “+ Agent”.</li>'
         }</ul>
         ${docsHtml()}`
      : `<div class="row"><h3>BOARDROOM</h3><button class="sm" id="br-help" title="How to use the whiteboard">?</button><button class="sm" id="br-out">Sign out</button></div>
      <select id="br-co">${br.companies
        .map((c) => `<option value="${c.id}" ${c.id === br.company?.id ? 'selected' : ''}>${esc(c.name)}</option>`)
        .join('')}</select>
      <div style="color:#a1a1aa">Tap a meeting to join, or create a new one.</div>
      <button class="primary" id="br-new">+ Create new meeting</button>
      <ul>${br.meetings
        .map(
          (m) => `<li><button class="sm primary" data-open="${m.id}" title="Join the meeting">Join ›</button><span data-open="${m.id}">${esc(m.title)}</span>
           <button class="sm" data-ren="${m.id}" title="Rename">✎</button><button class="sm" data-del="${m.id}" title="Delete">🗑</button></li>`,
        )
        .join('') || '<li style="color:#a1a1aa">No meetings yet</li>'}</ul>`;
    const pages = board.pages.length;
    root.classList.toggle('present', pages > 0 && board.onTablet);
    const boardBar = pages
      ? `<div id="br-board"><div class="row"><button class="sm" id="bd-prev" title="Previous">‹</button>
          <span class="cap">Whiteboard ${esc(board.error || board.caption)}</span>
          <button class="sm" id="bd-next" title="Next">›</button>
          <button class="sm primary" id="bd-dl" title="Download what is presented">⬇ Download</button>
          <button class="sm" id="bd-tab">${board.onTablet ? '✕ Close' : '▭ On tablet'}</button></div></div>
        ${board.onTablet ? '<div id="br-bc-wrap"><canvas id="br-bc" width="1280" height="720"></canvas></div>' : ''}`
      : '';
    root.innerHTML = `${head}
      ${boardBar}
      <div id="br-log"></div>
      <div id="br-err">${esc(err)}</div>
      <div class="row"><input id="br-msg" placeholder="Write to the committee…" ${br.meeting ? '' : 'disabled'}>
        <button class="sm primary" id="br-send">Send</button>
        <button class="sm ${br.mic ? 'rec' : ''}" id="br-mic" title="${br.handsFree ? 'Always listening: tap to mute, or to interrupt a director' : 'Muted: tap to listen again'}">${br.handsFree ? '🎤' : '🔇'}</button></div>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="br-voice" ${br.voiceEnabled ? 'checked' : ''} style="flex:0"> Directors answer aloud</label>`;
    renderLog();
    const bc = root.querySelector<HTMLCanvasElement>('#br-bc');
    bc?.getContext('2d')?.drawImage(board.canvas, 0, 0);
    root.querySelector('#bd-prev')?.addEventListener('click', () => board.step(-1));
    root.querySelector('#bd-next')?.addEventListener('click', () => board.step(1));
    root.querySelector('#bd-dl')?.addEventListener('click', () => void board.download());
    root.querySelector('#bd-tab')?.addEventListener('click', () => board.toggleTablet());

    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T | null;
    const run = (p: Promise<unknown>) =>
      p.catch((e) => {
        err = (e as Error).message;
        render();
      });
    q('#br-out')?.addEventListener('click', () => br.logout());
    q('#br-help')?.addEventListener('click', () => tutorial.open());
    q('#br-back')?.addEventListener('click', () => br.leaveMeeting());
    // documentos de la reunión
    q('#br-doctoggle')?.addEventListener('click', () => {
      docsOpen = !docsOpen;
      render();
    });
    q('#br-docup')?.addEventListener('click', () => {
      br.uploadOpen = true;
      docsOpen = true;
      render();
    });
    q('#br-doc-cancel')?.addEventListener('click', () => {
      br.uploadOpen = false;
      pendingFile = null;
      onlyHere = false;
      render();
    });
    q('#br-doc-change')?.addEventListener('click', () => {
      pendingFile = null;
      render();
    });
    q<HTMLInputElement>('#br-file')?.addEventListener('change', (e) => {
      pendingFile = (e.target as HTMLInputElement).files?.[0] ?? null;
      render();
    });
    q<HTMLInputElement>('#br-onlyhere')?.addEventListener('change', (e) => {
      onlyHere = (e.target as HTMLInputElement).checked;
    });
    q('#br-doc-send')?.addEventListener('click', () => {
      const file = pendingFile;
      if (!file) return;
      const only = onlyHere;
      const send = q<HTMLButtonElement>('#br-doc-send');
      if (send) {
        send.disabled = true;
        send.textContent = 'Uploading and indexing…';
      }
      run(
        br.uploadDoc(file, only).then(() => {
          pendingFile = null;
          onlyHere = false;
        }),
      );
    });
    root.querySelectorAll<HTMLElement>('[data-scope]').forEach((el) =>
      el.addEventListener('click', () => run(br.toggleDocScope(el.dataset.scope as string))),
    );
    root.querySelectorAll<HTMLElement>('[data-deldoc]').forEach((el) =>
      el.addEventListener('click', () => {
        const d = br.docs.find((x) => x.id === el.dataset.deldoc);
        if (d && window.confirm(`Delete “${d.name}”? It is also removed from Vercel Blob and from the directors' context.`)) {
          run(br.deleteDoc(d.id));
        }
      }),
    );
    q('#br-addag')?.addEventListener('click', () =>
      run(
        (async () => {
          const pick = q('#br-agpick');
          if (!pick) return;
          if (pick.style.display !== 'none') {
            pick.style.display = 'none';
            return;
          }
          const positions = await br.loadPositions();
          pick.style.display = 'block';
          const existing = br.available;
          pick.innerHTML = `
            <b>Already in the company</b>
            ${
              existing.length
                ? `<div class="row"><select id="br-exist">${existing
                    .map((a) => `<option value="${a.id}">${esc(a.name)} · ${esc(a.title)}</option>`)
                    .join('')}</select><button class="sm primary" id="br-existok">Seat</button></div>`
                : '<div style="color:#a1a1aa">All directors are already at the table.</div>'
            }
            <b>Create new (preconfigured)</b>
            <div class="row"><select id="br-pos">${positions
              .map((p) => `<option value="${p.key}">${esc(p.title)}</option>`)
              .join('')}</select><button class="sm primary" id="br-posok">Create</button></div>`;
          q('#br-existok')?.addEventListener('click', () =>
            run(br.addExisting(q<HTMLSelectElement>('#br-exist')?.value ?? '')),
          );
          q('#br-posok')?.addEventListener('click', () =>
            run(br.addAgent((q<HTMLSelectElement>('#br-pos')?.value ?? '') as string)),
          );
        })(),
      ),
    );
    root.querySelectorAll<HTMLElement>('[data-unseat]').forEach((el) =>
      el.addEventListener('click', () => run(br.removeFromMeeting(el.dataset.unseat as string))),
    );
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
        const t = window.prompt('New meeting name', cur)?.trim();
        if (t) run(br.renameMeeting(id, t));
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-del]').forEach((el) =>
      el.addEventListener('click', () => {
        if (window.confirm('Delete the meeting? Its summary is also removed from the agents\' context.'))
          run(br.deleteMeeting(el.dataset.del as string));
      }),
    );
  }

  function renderLog() {
    const log = root.querySelector('#br-log');
    if (!log) return;
    log.innerHTML = br.transcript.length
      ? br.transcript.map((l) => `<div class="${l.me ? 'me' : ''}"><b>${esc(l.who)}</b>${esc(l.text || '…')}</div>`).join('')
      : '<span style="color:#a1a1aa">Open a meeting, then just speak (or type) to the committee.</span>';
    log.scrollTop = log.scrollHeight;
    const errEl = root.querySelector('#br-err');
    if (errEl) errEl.textContent = err;
  }

  // tutorial de gestos (fuera de XR; dentro, lo muestra el panel 3D)
  const tut = document.createElement('div');
  tut.id = 'br-tut';
  document.body.append(tut);
  function renderTut() {
    tut.style.display = tutorial.visible ? '' : 'none';
    if (!tutorial.visible) return;
    const s = tutorial.current;
    const done = tutorial.done.has(tutorial.step);
    tut.innerHTML = `<div class="card">
      <div class="eyebrow">HOW TO USE THE WHITEBOARD</div>
      <div class="main"><canvas id="tu-art" width="${ART_W}" height="${ART_H}"></canvas>
        <div class="text"><h2>${esc(s.title)}</h2>
        <p>${esc(s.body)}</p>
        <div class="try ${done ? 'ok' : ''}">${s.tryGesture ? esc(done ? 'Well done!' : (s.tryText ?? '')) : ''}</div></div></div>
      <div class="row"><button id="tu-prev" ${tutorial.step === 0 ? 'disabled' : ''}>Previous</button>
        <span class="dots">${tutorial.step + 1} / ${STEPS.length}</span>
        <button class="primary" id="tu-next">${tutorial.last ? 'Start' : 'Next'}</button></div>
      <div class="row"><button class="grow" id="tu-never">${tutorial.dontShow ? '☑' : '☐'} Don't show again</button>
        <button id="tu-skip">Skip</button></div></div>`;
    tut.querySelector('#tu-prev')?.addEventListener('click', () => tutorial.prev());
    tut.querySelector('#tu-next')?.addEventListener('click', () => tutorial.next());
    tut.querySelector('#tu-never')?.addEventListener('click', () => tutorial.toggleDontShow());
    tut.querySelector('#tu-skip')?.addEventListener('click', () => tutorial.close());
    if (!raf) raf = requestAnimationFrame(animate);
  }
  // la ilustración del paso se anima mientras el tutorial está abierto
  let raf = 0;
  function animate(ms: number) {
    const c = tut.querySelector<HTMLCanvasElement>('#tu-art');
    if (!tutorial.visible || !c) {
      raf = 0;
      return;
    }
    const ctx = c.getContext('2d');
    if (ctx) drawGestureArt(ctx, tutorial.step, ms / 1000);
    raf = requestAnimationFrame(animate);
  }
  // editor de directores (nombre y sexo): se abre al tocar la etiqueta de un director en la sala
  const ae = document.createElement('div');
  ae.id = 'br-ae';
  document.body.append(ae);
  let aeShown = false;
  function renderAe() {
    ae.style.display = agentEditor.open ? '' : 'none';
    if (!agentEditor.open) {
      aeShown = false;
      return;
    }
    // si ya está abierto solo se actualizan el error y el botón: no se pisa lo que se está escribiendo
    if (aeShown) {
      ae.querySelector('.err')!.textContent = agentEditor.error;
      const save = ae.querySelector<HTMLButtonElement>('#ae-save');
      if (save) {
        save.disabled = agentEditor.saving;
        save.textContent = agentEditor.saving ? 'Saving…' : 'Save';
      }
      return;
    }
    aeShown = true;
    ae.innerHTML = `<div class="card">
      <div class="eyebrow">EDIT DIRECTOR</div>
      <input type="text" id="ae-name" maxlength="40" autocomplete="off" value="${esc(agentEditor.name)}">
      <div class="row">
        <label><input type="radio" name="ae-sex" id="ae-female" ${agentEditor.female ? 'checked' : ''}> Female</label>
        <label><input type="radio" name="ae-sex" id="ae-male" ${agentEditor.female ? '' : 'checked'}> Male</label>
      </div>
      <div class="err"></div>
      <div class="row"><button id="ae-cancel">Cancel</button><button class="primary" id="ae-save">Save</button></div></div>`;
    const input = ae.querySelector<HTMLInputElement>('#ae-name');
    input?.addEventListener('input', () => agentEditor.setName(input.value));
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void agentEditor.commit();
      if (e.key === 'Escape') agentEditor.cancel();
    });
    ae.querySelector('#ae-female')?.addEventListener('change', () => (agentEditor.female = true));
    ae.querySelector('#ae-male')?.addEventListener('change', () => (agentEditor.female = false));
    ae.querySelector('#ae-cancel')?.addEventListener('click', () => agentEditor.cancel());
    ae.querySelector('#ae-save')?.addEventListener('click', () => void agentEditor.commit());
    input?.focus();
  }
  agentEditor.onChange = renderAe;
  renderAe();

  tutorial.onChange = renderTut;
  renderTut();

  board.onChange = () => render();
  br.onChange = () => {
    err = '';
    render();
  };
  render();
}
