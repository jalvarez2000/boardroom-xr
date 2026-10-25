import { createSystem, UIKit, UIKitMLAsset } from '@iwsdk/core';
import { PMREMGenerator, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bridge } from './bridge.js';
import { Person, PersonSpec } from './person.js';
import { buildRoom, Room, SEATS } from './room.js';
import { smoothstep } from './util.js';

/** Appearance, role and fidgets of each possible participant (one per seat). */
const PEOPLE: PersonSpec[] = [
  { name: 'Marketing', female: true, model: 'Business_Female_01', tex: 'f014', activity: 'notes', seed: 101 },
  { name: 'Ventas', model: 'Business_Male_01', tex: 'm005', activity: 'listening', seed: 202 },
  { name: 'I+D', model: 'Business_Male_06', tex: 'm025', activity: 'laptop', seed: 303 },
  { name: 'Finanzas', model: 'Business_Male_04', tex: 'm015', activity: 'notes', seed: 404 },
  { name: 'RR. HH.', female: true, model: 'Business_Female_02', tex: 'f015', activity: 'listening', seed: 505 },
];

const INITIAL = [0, 1, 2];

const OUT = 0.32; // how far a chair is pulled out when empty / while someone arrives

interface Seat {
  person: Person;
  occ: number; // 0 = empty, 1 = seated
  goal: number;
  lookTimer: number;
  lookAtViewer: boolean;
}

/** La fuente por defecto de UIKit no trae acentos, ñ ni signos tipográficos: se pliegan a ASCII. */
const ascii = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿¡]/g, '')
    .replace(/[·•]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'");

export class MeetingSystem extends createSystem({}) {
  private room!: Room;
  private seats: Seat[] = [];
  private order: number[] = [];
  private viewer = new Vector3();
  private headPos = new Vector3();
  private speaker = -1;
  private lastSpeaker = -1;
  private speakTimer = 3;
  private countText: UIKit.Text | undefined;
  private subtitleText: UIKit.Text | undefined;
  private micLabel: UIKit.Text | undefined;
  private micBtn: UIKit.Text | undefined;
  private agentsVersion = -1;
  private lastStatus = '';
  private lastSubtitle = '';
  private lastMic = false;

  init(): void {
    // image-based lighting: soft reflections on the table, glass, ceramics and skin
    const pmrem = new PMREMGenerator(this.world.renderer);
    this.world.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.world.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.room = buildRoom();
    this.world.scene.add(this.room.group);

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

    const panel = this.world.getSceneObject<UIKitMLAsset>('controls-panel');
    this.countText = panel?.getElementById<UIKit.Text>('count-text') ?? undefined;
    this.subtitleText = panel?.getElementById<UIKit.Text>('subtitle') ?? undefined;
    this.micLabel = panel?.getElementById<UIKit.Text>('mic-label') ?? undefined;
    const mic = panel?.getElementById('mic-btn');
    const meet = panel?.getElementById('meet-btn');
    if (mic && meet) {
      this.micBtn = mic as unknown as UIKit.Text;
      const onMic = () => bridge.onMic();
      const onMeet = () => bridge.onNewMeeting();
      mic.addEventListener('click', onMic);
      meet.addEventListener('click', onMeet);
      this.cleanupFuncs.push(
        () => mic.removeEventListener('click', onMic),
        () => meet.removeEventListener('click', onMeet),
      );
    }
    this.refreshUI();
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
    if (bridge.status !== this.lastStatus) {
      this.lastStatus = bridge.status;
      this.countText?.setProperties({ text: ascii(bridge.status) });
    }
    if (bridge.subtitle !== this.lastSubtitle) {
      this.lastSubtitle = bridge.subtitle;
      // el panel es pequeño: solo el final del texto
      const t = bridge.subtitle;
      this.subtitleText?.setProperties({ text: ascii(t.length > 220 ? `…${t.slice(-220)}` : t) });
    }
    if (bridge.micActive !== this.lastMic) {
      this.lastMic = bridge.micActive;
      this.micLabel?.setProperties({ text: bridge.micActive ? 'Escuchando... (pulsa para enviar)' : 'Hablar' });
      this.micBtn?.setProperties({ opacity: 1 });
    }
  }

  private refreshUI(): void {
    this.countText?.setProperties({ text: ascii(bridge.status) });
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

  update(delta: number, time: number): void {
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
      p.setSpeaking(i === this.speaker && s.occ >= 1);
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
  }
}
