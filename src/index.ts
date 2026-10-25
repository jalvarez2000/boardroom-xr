import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Boardroom } from './boardroom.js';
import { MeetingSystem } from './meeting-system.js';
import { mountUi } from './ui.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(MeetingSystem);

  // Interfaz de Boardroom: DOM en pantalla (empresas, reuniones, texto) y panel 3D + voz dentro de XR.
  const boardroom = new Boardroom();
  boardroom.adoptTokenFromUrl();
  mountUi(boardroom);
  if (boardroom.loggedIn) {
    boardroom.loadCompanies().catch(() => boardroom.logout()); // token caducado o servidor caído
  }

  // En inmersivo el DOM no se ve: se oculta y manda el panel 3D + la voz.
  const xr = world.renderer.xr;
  xr.addEventListener('sessionstart', () => document.body.classList.add('xr-active'));
  xr.addEventListener('sessionend', () => document.body.classList.remove('xr-active'));
});
