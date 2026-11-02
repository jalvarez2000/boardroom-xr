import { createSystem } from '@iwsdk/core';
import { CanvasTexture, ClampToEdgeWrapping, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, PMREMGenerator, Quaternion, SRGBColorSpace, Texture, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bridge } from './bridge.js';
import { Person, PersonSpec } from './person.js';
import { PokeInteractable, RayInteractable } from '@iwsdk/core';
import { dockMatrix } from './dock.js';
import { BoardUi } from './board-ui.js';
import { TabletUi } from './tablet-ui.js';
import { TutorialUi } from './tutorial-ui.js';
import { BoardPointer } from './board-pointer.js';
import { VirtualKeyboard } from './keyboard.js';
import { Notebook } from './notebook.js';
import { Diagnostics } from './diagnostics.js';
import { AgentEditorUi } from './agent-editor-ui.js';
import { agentEditor } from './agent-editor.js';
import { isFemale } from './api.js';
import { notes } from './notes.js';
import { readBoardGestures, type HandPads } from './board-gestures.js';
import { board } from './whiteboard.js';
import { buildRoom, Room, SEATS, TABLE, TABLET_SCREEN } from './room.js';
import { smoothstep } from './util.js';
import { Waiting } from './waiting.js';

/** Appearance, role and fidgets of each possible participant (one per seat). */
const PEOPLE: PersonSpec[] = [
  { name: 'Marketing', female: true, model: 'Business_Female_01', tex: 'f014', activity: 'notes', seed: 101 },
  { name: 'Sales', model: 'Business_Male_01', tex: 'm005', activity: 'listening', seed: 202 },
  { name: 'R&D', model: 'Business_Male_06', tex: 'm025', activity: 'laptop', seed: 303 },
  { name: 'Finance', model: 'Business_Male_04', tex: 'm015', activity: 'notes', seed: 404 },
  { name: 'HR', female: true, model: 'Business_Female_02', tex: 'f015', activity: 'listening', seed: 505 },
  { name: 'Legal', model: 'Business_Male_01', tex: 'm005', activity: 'notes', seed: 606 },
];

// la sala empieza vacía: los directores se sientan solo al unirse a una reunión
const INITIAL: number[] = [];

/** Avatares disponibles por sexo: cada director toma uno del suyo, sin repetir mientras haya. */
const LOOKS = {
  female: [
    { model: 'Business_Female_01', tex: 'f014' },
    { model: 'Business_Female_02', tex: 'f015' },
  ],
  male: [
    { model: 'Business_Male_01', tex: 'm005' },
    { model: 'Business_Male_04', tex: 'm015' },
    { model: 'Business_Male_06', tex: 'm025' },
  ],
};

const OUT = 0.32; // how far a chair is pulled out when empty / while someone arrives

interface Seat {
  person: Person;
  occ: number; // 0 = empty, 1 = seated
  goal: number;
  lookTimer: number;
  lookAtViewer: boolean;
}

/** Dónde quedan los ojos del usuario sentado en la cabecera de la mesa (m). */
/** En realidad mixta: a qué altura sobre la mesa (m) quedan los ojos del usuario sentado. */
const MR_EYES_ABOVE_TABLE = 0.5;
const SEAT_EYE = { x: 0, y: 1.15, z: 0.12 };

export class MeetingSystem extends createSystem({}) {
  private room!: Room;
  private seats: Seat[] = [];
  private order: number[] = [];
  private viewer = new Vector3();
  private headPos = new Vector3();
  private corner = new Vector3();
  private quad = new Array<number>(8).fill(0);
  private dockEl: HTMLElement | null = null;
  private tabletUi!: TabletUi;
  private boardUi!: BoardUi;
  private tutorialUi!: TutorialUi;
  private boardPointer!: BoardPointer;
  private keyboard!: VirtualKeyboard;
  private notebook!: Notebook;
  private diagnostics!: Diagnostics;
  private agentEditorUi!: AgentEditorUi;
  private labelHits: Mesh[] = [];
  private labelPos = new Vector3();
  private labelQuat = new Quaternion();
  private idleWall: Texture | null = null;
  private wallTex!: CanvasTexture;
  private tabletTex!: CanvasTexture;
  private boardVersion = -1;
  private speaker = -1;
  private lastSpeaker = -1;
  private speakTimer = 3;
  private agentsVersion = -1;
  private waiting = new Waiting();

  init(): void {
    // image-based lighting: soft reflections on the table, glass, ceramics and skin
    const pmrem = new PMREMGenerator(this.world.renderer);
    this.world.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.world.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.room = buildRoom();
    (window as unknown as Record<string, unknown>).__boardroomRoom = this.room;
    this.world.scene.add(this.room.group);
    // los vidrios y sombras de la sala (transparentes) se pintan antes que los paneles de UI: se ordenan por el
    // origen del objeto y, si no, las botellas de la mesa asomaban por delante de los paneles que flotan ante ellas
    this.room.group.traverse((o) => {
      const m = (o as Mesh).material as { transparent?: boolean } | undefined;
      if (m && !Array.isArray(m) && m.transparent) o.renderOrder = -10;
    });
    // orbe de espera sobre el centro de la mesa
    this.waiting.group.position.set(0, TABLE.y, TABLE.zFront - TABLE.length / 2);
    this.room.group.add(this.waiting.group);

    PEOPLE.forEach((spec, i) => {
      const person = new Person(spec);
      this.room.group.add(person.root);
      const seat: Seat = {
        person,
        occ: INITIAL.includes(i) ? 1 : 0,
        goal: INITIAL.includes(i) ? 1 : 0,
        lookTimer: Math.random() * 2,
        lookAtViewer: true,
      };
      this.seats.push(seat);
      this.placeSeat(i);
    });
    this.order = [...INITIAL];
    this.tabletUi = new TabletUi(this.world, this.cleanupFuncs);
    this.boardUi = new BoardUi(this.world, this.cleanupFuncs);
    // la pizarra de la pared y la pantalla de la tablet comparten el canvas de `board`
    this.wallTex = new CanvasTexture(board.canvas);
    this.tabletTex = new CanvasTexture(board.canvas);
    for (const t of [this.wallTex, this.tabletTex]) t.colorSpace = SRGBColorSpace;
    // la página es 16:9 y la pantalla de la tablet no: se encaja entera con bandas
    const k = 16 / 9 / (TABLET_SCREEN.w / TABLET_SCREEN.h);
    this.tabletTex.wrapT = ClampToEdgeWrapping;
    this.tabletTex.repeat.set(1, k);
    this.tabletTex.offset.set(0, (1 - k) / 2);
    this.tutorialUi = new TutorialUi(this.world, this.cleanupFuncs);
    // mirada y pellizco sobre la pizarra (pared y tarjeta cercana)
    this.boardPointer = new BoardPointer(this.world, this.wallTex, this.cleanupFuncs);
    // teclado delante de la tablet y cuaderno a la derecha: lo que se teclea se escribe en el cuaderno
    this.keyboard = new VirtualKeyboard(this.world, this.cleanupFuncs);
    this.notebook = new Notebook(this.world, this.cleanupFuncs);
    this.diagnostics = new Diagnostics(this.world, this.cleanupFuncs);
    this.agentEditorUi = new AgentEditorUi(this.world, this.cleanupFuncs);
    // un área tocable sobre la etiqueta de cada director: abre su editor (nombre y sexo)
    this.seats.forEach((_, i) => {
      const hit = new Mesh(new PlaneGeometry(0.36, 0.09), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.visible = false;
      const entity = this.world.createTransformEntity(hit as unknown as Object3D);
      entity.addComponent(RayInteractable);
      entity.addComponent(PokeInteractable);
      const target = hit as unknown as { addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void };
      const open = () => {
        const agent = bridge.agents[i];
        if (agent) bridge.onEditAgent(agent.id);
      };
      target.addEventListener('click', open);
      this.cleanupFuncs.push(() => target.removeEventListener('click', open));
      this.labelHits.push(hit);
    });
  }

  /** Sienta en el asiento `i` un avatar del sexo pedido (lo recarga si el que había era del otro). */
  private ensureLook(i: number, female: boolean): void {
    const seat = this.seats[i];
    if (!seat || seat.person.female === female) return;
    const pool = LOOKS[female ? 'female' : 'male'];
    const used = new Set(this.seats.filter((s, j) => j !== i && s.goal > 0).map((s) => s.person.spec.model));
    const look = pool.find((l) => !used.has(l.model)) ?? pool[i % pool.length]!;
    const old = seat.person;
    const person = new Person({ ...old.spec, female, model: look.model, tex: look.tex, name: old.spec.name });
    this.room.group.add(person.root);
    old.root.removeFromParent();
    seat.person = person;
    this.placeSeat(i);
  }

  /** Asigna los directores de la empresa a los asientos (máx. uno por asiento). */
  private assignAgents(): void {
    const n = Math.min(bridge.agents.length, this.seats.length);
    this.order = [];
    this.seats.forEach((seat, i) => {
      const agent = bridge.agents[i];
      if (i < n && agent) {
        const first = agent.name.split(' ')[0] ?? agent.name;
        const role = (agent.title.split(/\s[—-]\s/)[0] ?? agent.title).trim();
        this.ensureLook(i, isFemale(agent.voice));
        seat.person.setName(`${first} · ${role}`);
        seat.goal = 1;
        this.order.push(i);
      } else {
        seat.goal = 0;
      }
    });
  }

  private syncBridge(): void {
    if (this.agentsVersion !== bridge.agentsVersion) {
      this.agentsVersion = bridge.agentsVersion;
      this.assignAgents();
    }
  }

  /** realidad mixta: se ve el entorno real, así que la oficina se oculta y quedan la mesa, las sillas, las personas, la pizarra y la tablet */
  private mr = false;

  /** la pantalla de la tablet lleva una página de la pizarra */
  private tabletHasPage = false;

  private syncBlend(inXr: boolean): void {
    const blend = inXr ? this.world.renderer.xr.getSession()?.environmentBlendMode : undefined;
    const mr = !!blend && blend !== 'opaque';
    if (mr === this.mr) return;
    this.mr = mr;
    for (const o of this.room.office) o.visible = !mr;
  }

  /** instante (ms) de entrada en XR; -1 = ya colocado en su asiento en esta sesión */
  private xrSeatT = 0;

  /**
   * Sienta al usuario en la silla de la cabecera: sin esto su cabeza queda donde la deje el visor (a la altura del
   * suelo real o a la de su cabeza al entrar), y sentado en la vida real la sala se ve demasiado alta.
   * Se coloca ~1 s después de entrar en XR, cuando la pose de la cabeza ya es válida.
   */
  private seatViewer(inXr: boolean): void {
    if (!inXr) {
      if (this.xrSeatT !== 0) this.world.player.position.set(0, 0, 0);
      this.xrSeatT = 0;
      return;
    }
    if (this.xrSeatT < 0) return;
    if (this.xrSeatT === 0) this.xrSeatT = performance.now();
    if (performance.now() - this.xrSeatT < 1000) return;
    this.xrSeatT = -1;
    const head = this.world.camera.position; // local al jugador
    // en mixta no se fía del suelo del visor (sentado, la mesa salía alta): la mesa se coloca respecto a los ojos
    const eyeY = this.mr ? TABLE.y + MR_EYES_ABOVE_TABLE : SEAT_EYE.y;
    const y = eyeY - head.y;
    this.world.player.position.set(SEAT_EYE.x - head.x, y, SEAT_EYE.z - head.z);
  }

  /** En XR manda el panel UIKit de la tablet; fuera, el popup DOM se asienta sobre su pantalla (proyectando sus 4 esquinas). */
  private updateTablet(): void {
    this.dockEl ??= document.getElementById('br-ui');
    const el = this.dockEl;
    const inXr = this.world.renderer.xr.isPresenting;
    this.syncBlend(inXr);
    this.seatViewer(inXr);
    this.tabletUi.sync(inXr);
    this.boardUi.sync(inXr);
    this.tutorialUi.sync(inXr);
    this.agentEditorUi.sync(inXr);
    this.boardPointer.sync(inXr);
    if (inXr) readBoardGestures(this.input.xr as unknown as HandPads);
    this.syncBoard();
    // en XR la pantalla de la tablet solo se pinta si lleva una página: si no, el panel UIKit que va pegado encima
    // se pelea con ella en profundidad y parpadea
    this.room.tabletScreen.visible = !inXr || this.tabletHasPage;
    if (!el) return;
    let m: string | null = null;
    if (!inXr) {
      const cam = this.world.camera;
      const r = this.world.renderer.domElement.getBoundingClientRect();
      const hw = TABLET_SCREEN.w / 2;
      const hh = TABLET_SCREEN.h / 2;
      const corners: [number, number][] = [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]];
      this.room.tablet.updateWorldMatrix(true, false);
      cam.updateMatrixWorld();
      let ok = true;
      corners.forEach(([x, y], i) => {
        this.corner.set(x, y, TABLET_SCREEN.z);
        this.room.tablet.localToWorld(this.corner).project(cam);
        if (this.corner.z > 1) ok = false;
        this.quad[i * 2] = r.left + ((this.corner.x + 1) / 2) * r.width;
        this.quad[i * 2 + 1] = r.top + ((1 - this.corner.y) / 2) * r.height;
      });
      if (ok) m = dockMatrix(this.quad, el.offsetWidth, el.offsetHeight);
    }
    el.classList.toggle('docked', m !== null);
    el.style.transform = m ?? '';
    // el popup DOM va siempre por encima del canvas: con el cuaderno en las manos se esconde para que se pueda leer
    el.style.visibility = notes.reading ? 'hidden' : '';
  }

  /** Pone la página presentada en la pizarra de la pared y, si se pidió, en la pantalla de la tablet. */
  private syncBoard(): void {
    if (this.boardVersion === board.version) return;
    this.boardVersion = board.version;
    const wall = this.room.wallScreen.material as MeshBasicMaterial;
    this.idleWall ??= wall.map;
    const has = board.pages.length > 0;
    wall.map = has ? this.wallTex : this.idleWall;
    wall.needsUpdate = true;
    this.wallTex.needsUpdate = true;
    this.tabletTex.needsUpdate = true;
    const screen = this.room.tabletScreen.material as MeshBasicMaterial;
    const show = has && board.onTablet;
    screen.map = show ? this.tabletTex : null;
    this.tabletHasPage = show;
    screen.color.set(show ? 0xffffff : 0x12161e);
    screen.needsUpdate = true;
  }

  private placeSeat(i: number): void {
    const seat = this.seats[i];
    const def = SEATS[i];
    const e = smoothstep(seat.occ);
    const slide = OUT * (1 - e);
    // "outward" is behind the seat: -forward
    const ox = -Math.sin(def.rotY) * slide;
    const oz = -Math.cos(def.rotY) * slide;
    const p = seat.person.root;
    p.position.set(def.x + ox, 0, def.z + oz);
    p.rotation.y = def.rotY;
    const c = this.room.chairs[i];
    c.position.copy(p.position);
    c.rotation.y = def.rotY + (1 - e) * (i % 2 ? -0.35 : 0.35);
    p.visible = seat.occ > 0.01;
    seat.person.bag.setFade(e);
  }

  /** fotogramas desde el último repintado del mapa de sombras */
  private shadowAge = 0;

  update(delta: number, time: number): void {
    // el mapa de sombras se repinta en cada fotograma por defecto (otra pasada completa de la escena en estéreo):
    // basta repintarlo ~12 veces por segundo
    const sm = this.world.renderer.shadowMap;
    if (sm.autoUpdate) sm.autoUpdate = false;
    if (++this.shadowAge >= 6) {
      this.shadowAge = 0;
      sm.needsUpdate = true;
    }
    const dt = Math.min(delta, 0.1);
    this.world.camera.getWorldPosition(this.viewer);

    // animate arrivals / departures
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.occ !== s.goal) {
        const step = dt / 1.4;
        s.occ = s.goal > s.occ ? Math.min(s.goal, s.occ + step) : Math.max(s.goal, s.occ - step);
      }
      this.placeSeat(i);
    }

    this.syncBridge();
    this.keyboard.update();
    this.diagnostics.update(this.world.renderer.xr.isPresenting);
    this.notebook.update(dt, this.world.camera);
    this.waiting.update(dt, time, bridge.busy > 0 || bridge.micActive, bridge.micActive, bridge.micLevel);
    this.updateTablet();
    const present = this.order.filter((i) => this.seats[i].occ >= 1);
    if (bridge.connected) {
      // reunión real: habla quien indica Boardroom
      const idx = bridge.speakerId ? bridge.agents.findIndex((a) => a.id === bridge.speakerId) : -1;
      this.speaker = idx >= 0 && this.order.includes(idx) ? idx : -1;
    } else {
      // demo sin conexión: se alternan los participantes con silencios cortos
      this.speakTimer -= dt;
      if (this.speakTimer <= 0) {
        if (this.speaker >= 0) {
          this.speaker = -1;
          this.speakTimer = 1.2 + Math.random() * 1.8;
        } else if (present.length > 0) {
          this.speaker = present[Math.floor(Math.random() * present.length)];
          this.speakTimer = 5 + Math.random() * 7;
        } else {
          this.speakTimer = 2;
        }
      }
    }

    // when somebody new starts talking, listeners turn to them after a short reaction delay
    if (this.speaker !== this.lastSpeaker) {
      this.lastSpeaker = this.speaker;
      if (this.speaker >= 0) {
        for (const s of this.seats) s.lookTimer = Math.min(s.lookTimer, 0.2 + Math.random() * 0.6);
      }
    }

    // gaze targets
    if (this.speaker >= 0) this.seats[this.speaker].person.headWorld(this.headPos);
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s.occ <= 0) continue;
      const p = s.person;
      const thinking = bridge.connected && !!bridge.thinkingId && bridge.agents[i]?.id === bridge.thinkingId;
      p.setThinking(thinking);
      // mientras razona solo mueve la boca si está soltando la frase «voy a ver en mis apuntes»
      p.setSpeaking(i === this.speaker && s.occ >= 1 && (!thinking || bridge.talking));
      s.lookTimer -= dt;
      if (s.lookTimer <= 0) {
        // hold each gaze for a few seconds; listeners mostly follow the speaker,
        // who addresses the chair
        s.lookTimer = 3 + Math.random() * 4;
        s.lookAtViewer =
          i === this.speaker ? Math.random() < 0.85 : Math.random() < (this.speaker >= 0 ? 0.15 : 0.85);
      }
      if (i !== this.speaker && this.speaker >= 0 && !s.lookAtViewer) {
        p.setLookTarget(this.headPos);
      } else {
        p.setLookTarget(this.viewer);
      }
      p.update(dt, time, this.viewer);
    }
    // el área tocable de cada etiqueta sigue a la etiqueta (solo con el director sentado y el editor cerrado)
    for (let i = 0; i < this.labelHits.length; i++) {
      const hit = this.labelHits[i];
      const seat = this.seats[i];
      if (!hit || !seat) continue;
      hit.visible = !!bridge.agents[i] && this.order.includes(i) && seat.occ >= 1 && !agentEditor.open;
      if (hit.visible) {
        seat.person.labelPose(this.labelPos, this.labelQuat);
        hit.position.copy(this.labelPos);
        hit.quaternion.copy(this.labelQuat);
      }
    }
  }
}
