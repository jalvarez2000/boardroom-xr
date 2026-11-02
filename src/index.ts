import { SessionMode, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Boardroom } from './boardroom.js';
import { MeetingSystem } from './meeting-system.js';
import { mountUi } from './ui.js';
import { installBoardDemo } from './dev-board-demo.js';
import { notes } from './notes.js';
import { readDiagFlag } from './diagnostics.js';
import { bridge } from './bridge.js';

function mountXrButtons(world: World): void {
  const style = document.createElement('style');
  style.textContent = `#br-xr{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:10px;font:600 15px system-ui,-apple-system,"Segoe UI",sans-serif}
#br-xr button{border:0;border-radius:999px;padding:12px 22px;color:#fff;background:#4f46e5;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.4)}
#br-xr button.mr{background:#0e7490}
#br-xr button:hover{filter:brightness(1.15)}
body.xr-active #br-xr{display:none}`;
  document.head.append(style);
  const bar = document.createElement('div');
  bar.id = 'br-xr';
  document.body.append(bar);
  const add = (label: string, mode: SessionMode, cls = '') => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = cls;
    b.onclick = () => world.launchXR({ sessionMode: mode });
    bar.append(b);
    return b;
  };
  const vr = navigator.xr?.isSessionSupported('immersive-vr') ?? Promise.resolve(false);
  const ar = navigator.xr?.isSessionSupported('immersive-ar') ?? Promise.resolve(false);
  void Promise.all([vr.catch(() => false), ar.catch(() => false)]).then(([hasVr, hasAr]) => {
    if (hasVr) add('Enter VR', SessionMode.ImmersiveVR);
    if (hasAr) add('Mixed reality', SessionMode.ImmersiveAR, 'mr');
  });
}

readDiagFlag();
World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(MeetingSystem);
  (window as unknown as Record<string, unknown>).__boardroomWorld = world; // para medir el rendimiento desde fuera

  // Interfaz de Boardroom: DOM en pantalla (empresas, reuniones, texto) y panel 3D + voz dentro de XR.
  const boardroom = new Boardroom();
  boardroom.adoptTokenFromUrl();
  notes.load(null);
  mountUi(boardroom);
  if (import.meta.env.DEV) installBoardDemo();
  if (boardroom.loggedIn) {
    boardroom.loadCompanies().catch(() => boardroom.logout()); // token caducado o servidor caído
  }

  // Entradas a XR: realidad virtual (sala completa) o realidad mixta opcional (sin oficina, solo mesa, sillas,
  // personas, pizarra, tablet y cuaderno sobre tu entorno real). IWSDK no ofrece la sesión solo (`offer: none`).
  mountXrButtons(world);

  // El permiso del micrófono solo se puede pedir con la página en pantalla: se pide en el primer toque (p. ej. «Enter XR»),
  // porque dentro de la sesión inmersiva no hay dónde mostrar el aviso y Hablar parecería no hacer nada.
  document.addEventListener(
    'click',
    () => {
      void navigator.mediaDevices
        ?.getUserMedia({ audio: true })
        .then((s) => s.getTracks().forEach((t) => t.stop()))
        .catch(() => {});
    },
    { once: true, capture: true },
  );

  // En inmersivo el DOM no se ve: se oculta y manda el panel 3D + la voz.
  const xr = world.renderer.xr;
  // en XR no hay selector de ficheros: «Subir» sale de la sesión para abrirlo en la pantalla
  bridge.endXr = () => void xr.getSession()?.end();
  xr.addEventListener('sessionstart', () => document.body.classList.add('xr-active'));
  xr.addEventListener('sessionend', () => document.body.classList.remove('xr-active'));
});
