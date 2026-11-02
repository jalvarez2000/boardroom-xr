import { api, isFemale, type DocInfo, MAX_UPLOAD_BYTES, type Agent, type Position, type Company, type Meeting, type TurnEvent, getToken, setToken } from './api.js';
import { bridge, setAgents } from './bridge.js';
import { board } from './whiteboard.js';
import { boardCommand } from './board-commands.js';
import { notes } from './notes.js';
import { agentEditor } from './agent-editor.js';
import { SentenceStream } from './speech-chunks.js';
import { Listener, Speaker } from './voice.js';

/**
 * Controlador de la reunión: une API (empresas, reuniones, chat), voz (STT/TTS),
 * el panel 3D (vía `bridge`) y la interfaz DOM.
 */
const MAX_SEATS = 6;
/** documentos por página en la tablet XR */
const DOC_PAGE = 3;

/** Muletillas al ponerse a consultar apuntes o fuentes; se elige una al azar sin repetir la anterior. */
const NOTE_PHRASES = [
  'Let me check my notes.',
  "Give me a second, I'll look it up in my notes.",
  'Hold on, let me check my notes.',
  'One moment, let me verify that.',
  'Let me review the data.',
  "Let me take a quick look and I'll tell you.",
  'I have that noted down somewhere.',
  'One moment, taking a look at my notes.',
  'Let me look that up in my notes.',
  'Let me go over what I have written down.',
  "Give me a second and I'll check my notes.",
  'Hold on, let me check my papers.',
  "I'll consult my notes before answering.",
  'Allow me a moment to review my notes.',
  'Let me see what I have noted on this.',
  'Let me confirm that in my notes.',
  "One moment, I'm going over my notes.",
  'Let me have a look at my notes.',
  'Let me see what I have jotted down here.',
  "Hold on a second, I'll verify it in my notes.",
  'I have it noted here, let me find it.',
  "One moment, I'm checking my papers.",
  "I'll check the figures in my notes.",
  'Let me locate that in my notes.',
  'Give me a moment to consult my notes.',
  "Better check my notes so I don't get it wrong.",
  'Hold on, let me find that figure in my notes.',
  "Bear with me a second, I'll check what I have.",
  "I'll go over my notes and get back to you.",
  'Let me review what I have written down.',
  'One second, let me cross-check this with my notes.',
  'Let me double-check that against my notes.',
];

export class Boardroom {
  private listener = new Listener();
  private speaker = new Speaker();
  private abort: AbortController | null = null;
  private generating = false;
  private lastPhrase = -1;
  /** documentos que ve la reunión abierta (globales + exclusivos de ella) */
  docs: DocInfo[] = [];
  /** la tablet XR muestra la lista de documentos */
  private showDocs = false;
  /** página de la lista de documentos en la tablet XR (3 por página) */
  private docPage = 0;
  /** formulario de subida abierto (lo abre «Subir» en XR, tras salir de la sesión) */
  uploadOpen = false;

  companies: Company[] = [];
  company: Company | null = null;
  agents: Agent[] = [];
  /** ids de TODOS los directores presentes en la reunión abierta (fuente de verdad: el servidor) */
  members: string[] = [];
  /** los que caben sentados en la mesa 3D (primeros MAX_SEATS de `members`) */
  seated: string[] = [];
  meetings: Meeting[] = [];
  meeting: Meeting | null = null;
  /** líneas visibles en la transcripción DOM */
  transcript: { who: string; text: string; me?: boolean }[] = [];
  onChange: () => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor() {
    this.speaker.onPlay = (u) => {
      bridge.speakerId = u.agentId;
      bridge.talking = true;
      const a = this.agents.find((x) => x.id === u.agentId) ?? this.participants.find((x) => x.id === u.agentId);
      bridge.status = `${a?.name ?? 'Director'} speaking`;
      bridge.subtitle = u.text;
    };
    this.speaker.onIdle = () => {
      bridge.talking = false;
      if (!this.generating) this.idle();
    };
    this.listener.onLevel = (l) => (bridge.micLevel = l);
    notes.uploader = (id, text, keepalive) => api.saveNotes(id, text, keepalive);
    const fail = (e: unknown) => this.onError((e as Error).message);
    bridge.onMic = () => void this.toggleMic().catch(fail);
    bridge.onNewMeeting = () => void this.newMeeting().catch(fail);
    bridge.onOpenMeeting = (id) => void this.selectMeeting(id).catch(fail);
    bridge.onBack = () => this.leaveMeeting();
    agentEditor.save = (id, name, female) => this.saveAgent(id, name, female);
    bridge.onEditAgent = (id) => {
      const a = this.agents.find((x) => x.id === id);
      if (a) agentEditor.openFor(a.id, a.name, isFemale(a.voice));
    };
    bridge.onOpenDocs = () => {
      this.showDocs = true;
      this.changed();
    };
    bridge.onDocsPage = (delta) => {
      this.docPage += delta;
      this.changed();
    };
    bridge.onCloseDocs = () => {
      this.showDocs = false;
      this.changed();
    };
    bridge.onUploadDocs = () => {
      this.uploadOpen = true;
      this.changed();
      bridge.endXr();
    };
    bridge.onToggleDocScope = (id) => void this.toggleDocScope(id).catch(fail);
    bridge.onDeleteDoc = (id) => void this.deleteDoc(id).catch(fail);
    bridge.onToggleVoice = () => {
      this.voiceEnabled = !this.voiceEnabled;
      this.changed();
    };
  }

  /** Mantiene encendido el aviso visual de la sala mientras dura una espera al servidor. */
  private async working<T>(job: () => Promise<T>): Promise<T> {
    bridge.busy++;
    try {
      return await job();
    } finally {
      bridge.busy--;
    }
  }

  /** Avisa a la interfaz DOM y refresca lo que muestra la tablet 3D. */
  private changed() {
    const page = !this.loggedIn ? 'login' : this.meeting ? (this.showDocs ? 'docs' : 'meeting') : 'list';
    const lines = this.transcript.slice(-4).map((l) => `${l.who}: ${l.text || '...'}`);
    const pages = Math.max(1, Math.ceil(this.docs.length / DOC_PAGE));
    this.docPage = Math.max(0, Math.min(pages - 1, this.docPage)); // al borrar, la página no se queda vacía
    bridge.view = {
      page,
      title: this.meeting?.title ?? this.company?.name ?? 'Boardroom',
      docs: this.docs
        .slice(this.docPage * DOC_PAGE, (this.docPage + 1) * DOC_PAGE)
        .map((d) => ({ id: d.id, name: d.name, global: d.scope === 'global' })),
      docCount: this.docs.length,
      listening: this.handsFree,
      docPage: this.docPage,
      docPages: pages,
      meetings: this.meetings.slice(0, 3).map((m) => ({ id: m.id, title: m.title })),
      log: lines.join('\n'),
      voice: this.voiceEnabled,
    };
    bridge.viewVersion++;
    this.onChange();
  }

  get mic() {
    return bridge.micActive;
  }

  get voiceEnabled() {
    return this.speaker.enabled;
  }
  set voiceEnabled(v: boolean) {
    this.speaker.enabled = v;
    if (!v) this.speaker.cancel();
  }

  private notePhrase(): string {
    let i: number;
    do i = Math.floor(Math.random() * NOTE_PHRASES.length);
    while (i === this.lastPhrase);
    this.lastPhrase = i;
    return NOTE_PHRASES[i] ?? NOTE_PHRASES[0]!;
  }

  private idle() {
    bridge.speakerId = null;
    bridge.thinkingId = null;
    bridge.status = !this.meeting
      ? 'Choose a meeting'
      : this.seated.length === 0
        ? 'Empty table · add a director'
        : this.handsFree
          ? 'Listening · just speak'
          : 'Mic muted · tap the mic to talk';
    this.resumeListening();
  }

  // ---------------------------------------------------------------- escucha continua (manos libres)

  /** El micrófono escucha siempre que no hable nadie y no se haya silenciado (se guarda la preferencia). */
  handsFree = localStorage.getItem('boardroom.mic.muted') !== '1';
  /** el navegador no dejó usar el micrófono: no se reintenta hasta que el usuario lo pulse */
  private micBlocked = false;
  private listenTimer = 0;

  private canListen(): boolean {
    return this.handsFree && !this.micBlocked && this.loggedIn && !!this.meeting && this.seated.length > 0 && !this.listener.active && !this.generating && !this.speaker.busy;
  }

  /** Pide reanudar la escucha con una pausa corta (así no recoge la cola de la voz de los directores). */
  private resumeListening(): void {
    window.clearTimeout(this.listenTimer);
    this.listenTimer = window.setTimeout(() => void this.listenOnce(), 600);
  }

  private async listenOnce(): Promise<void> {
    if (!this.canListen()) return;
    bridge.micActive = true;
    bridge.status = 'Listening…';
    this.changed();
    let text = '';
    try {
      text = await this.listener.start((t) => {
        bridge.subtitle = t;
      });
    } catch (e) {
      bridge.micActive = false;
      bridge.micLevel = 0;
      this.micBlocked = true;
      this.idle();
      this.onError(`Microphone unavailable: ${(e as Error).message}. Tap the mic to try again.`);
      return;
    }
    bridge.micActive = false;
    bridge.micLevel = 0;
    this.changed();
    if (text && this.handsFree && this.meeting) await this.send(text);
    else {
      bridge.subtitle = '';
      this.idle(); // vuelve a escuchar
    }
  }

  // ---------------------------------------------------------------- sesión y datos

  /** Acepta un token por la URL (`#token=…&url=…`) para entrar en las gafas sin teclado. */
  adoptTokenFromUrl(): void {
    const p = new URLSearchParams(location.hash.slice(1));
    const t = p.get('token');
    const url = p.get('url');
    if (url) localStorage.setItem('boardroom.url', url);
    if (t) {
      setToken(t);
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  get loggedIn() {
    return !!getToken();
  }

  login(email: string, password: string) {
    return this.working(async () => {
      await api.login(email, password);
      await this.fetchCompanies();
    });
  }

  logout() {
    setToken(null);
    this.listener.cancel();
    this.speaker.cancel();
    this.companies = [];
    this.company = null;
    this.meeting = null;
    this.agents = [];
    this.meetings = [];
    this.transcript = [];
    board.clear();
    bridge.connected = false;
    setAgents([]);
    bridge.status = 'Meeting room';
    bridge.subtitle = '';
    this.changed();
  }

  loadCompanies() {
    return this.working(() => this.fetchCompanies());
  }

  private async fetchCompanies() {
    this.companies = await api.companies();
    const first = this.companies[0];
    if (first) await this.loadCompany(first.id);
    else this.changed();
  }

  selectCompany(id: string) {
    return this.working(() => this.loadCompany(id));
  }

  private async loadCompany(id: string) {
    this.speaker.cancel();
    const r = await api.company(id);
    this.company = r.company;
    this.agents = r.agents;
    this.meetings = r.meetings;
    this.meeting = null;
    this.transcript = [];
    board.clear();
    bridge.connected = true;
    bridge.subtitle = '';
    this.members = [];
    this.syncSeats();
    this.idle();
    this.changed();
  }

  /** Directores sentados ahora: solo los de la reunión a la que te has unido (sin reunión, la sala está vacía). */
  get participants(): Agent[] {
    return this.meeting
      ? this.seated.map((id) => this.agents.find((a) => a.id === id)).filter((a): a is Agent => !!a)
      : [];
  }

  /** Directores de la empresa que aún no están sentados en la reunión. */
  get available(): Agent[] {
    return this.agents.filter((a) => !this.seated.includes(a.id));
  }

  get seatsFull() {
    return this.seated.length >= MAX_SEATS;
  }

  private syncSeats() {
    this.seated = this.members.slice(0, MAX_SEATS);
    setAgents(this.participants);
    if (!this.generating && !this.speaker.busy) this.idle();
  }

  selectMeeting(id: string) {
    return this.working(() => this.loadMeeting(id));
  }

  private async loadMeeting(id: string) {
    this.speaker.cancel();
    const r = await api.meeting(id);
    this.meeting = this.meetings.find((m) => m.id === id) ?? { ...r.meeting, updatedAt: r.meeting.updatedAt };
    this.transcript = r.messages.map((m) =>
      m.role === 'USER' ? { who: 'You', text: m.content, me: true } : { who: m.speaker, text: m.content },
    );
    board.clear();
    bridge.subtitle = '';
    // quién está en la reunión lo decide el servidor: solo ellos pueden responder
    this.agents = r.companyAgents;
    this.members = r.participants.map((a) => a.id);
    notes.load(id, r.meeting.notes ?? '');
    this.showDocs = false;
    this.docPage = 0;
    this.docs = await api.meetingDocuments(id).catch(() => []);
    this.syncSeats();
    this.idle();
    this.changed();
  }

  private async refreshMeetings() {
    if (!this.company) return;
    this.meetings = (await api.company(this.company.id)).meetings;
    if (this.meeting) {
      const m = this.meetings.find((x) => x.id === this.meeting?.id);
      if (m) this.meeting = m;
    }
    this.changed();
  }

  newMeeting() {
    return this.working(() => this.createMeeting());
  }

  private async createMeeting() {
    if (!this.company) return;
    const m = await api.createMeeting(this.company.id);
    // el servidor sienta por defecto a todos los directores actuales de la empresa
    await this.refreshMeetings();
    await this.loadMeeting(m.id);
  }

  /** Sale de la reunión abierta y vuelve a la lista. */
  leaveMeeting() {
    this.listener.cancel();
    this.speaker.cancel();
    this.abort?.abort();
    this.meeting = null;
    this.transcript = [];
    board.clear();
    this.members = [];
    this.docs = [];
    this.showDocs = false;
    this.uploadOpen = false;
    notes.load(null);
    this.syncSeats();
    bridge.subtitle = '';
    this.idle();
    this.changed();
  }

  // ---------------------------------------------------------------- documentos de la reunión

  /**
   * Sube un fichero a la reunión abierta: el servidor lo guarda en Vercel Blob y lo vectoriza para el contexto de los
   * directores. Por defecto vale para todas las reuniones de la empresa; `onlyHere` lo limita a esta.
   */
  uploadDoc(file: File, onlyHere: boolean) {
    const meeting = this.meeting;
    if (!meeting) throw new Error('Open a meeting to upload documents.');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} exceeds 4 MB.`);
    return this.working(async () => {
      bridge.status = `Uploading ${file.name}…`;
      this.changed();
      const doc = await api.uploadDocument(meeting.id, file, onlyHere ? 'meeting' : 'global');
      this.docs = [doc, ...this.docs];
      this.uploadOpen = false;
      bridge.status = `${file.name} is now part of the context`;
      this.changed();
    });
  }

  /** Guarda el nombre y el sexo de un director; la sala redibuja su etiqueta y, si cambia el sexo, su avatar y su voz. */
  async saveAgent(id: string, name: string, female: boolean) {
    const a = this.agents.find((x) => x.id === id);
    if (!a) return;
    const patch: { name?: string; gender?: 'female' | 'male' } = {};
    if (name !== a.name) patch.name = name;
    if (female !== isFemale(a.voice)) patch.gender = female ? 'female' : 'male';
    if (Object.keys(patch).length === 0) return;
    const updated = await api.updateAgent(id, patch);
    this.agents = this.agents.map((x) => (x.id === id ? { ...x, ...updated } : x));
    this.syncSeats();
    this.changed();
  }

  async toggleDocScope(docId: string) {
    const meeting = this.meeting;
    const doc = this.docs.find((d) => d.id === docId);
    if (!meeting || !doc) return;
    const updated = await api.setDocumentScope(docId, doc.scope === 'global' ? 'meeting' : 'global', meeting.id);
    this.docs = this.docs.map((d) => (d.id === docId ? updated : d));
    this.changed();
  }

  async deleteDoc(docId: string) {
    await api.deleteDocument(docId);
    this.docs = this.docs.filter((d) => d.id !== docId);
    this.changed();
  }

  async loadPositions(): Promise<Position[]> {
    return api.positions();
  }

  /** Guarda en el servidor quién está en la reunión (solo los presentes pueden responder). */
  private async saveMembers(next: string[]) {
    const meeting = this.meeting;
    if (!meeting) return;
    await api.setParticipants(meeting.id, next);
    this.members = next;
    this.syncSeats();
    this.changed();
  }

  /** Sienta en la reunión a un director que ya existe en la empresa. */
  async addExisting(agentId: string) {
    if (!this.meeting) return;
    if (this.seatsFull) return this.onError(`The table seats ${MAX_SEATS} people.`);
    if (!this.members.includes(agentId)) await this.saveMembers([...this.members, agentId]);
  }

  /** Crea un director (cargo del catálogo) en la empresa y lo sienta en la reunión. */
  async addAgent(positionKey: string) {
    if (!this.company) return;
    if (this.meeting && this.seatsFull) return this.onError(`The table seats ${MAX_SEATS} people.`);
    const created = await api.createAgent(this.company.id, positionKey);
    this.agents = (await api.company(this.company.id)).agents;
    if (this.meeting) await this.saveMembers([...this.members, created.id]);
    else this.changed();
  }

  /** Saca de la reunión a un director (sigue existiendo en la empresa y ya no puede responder). */
  async removeFromMeeting(agentId: string) {
    await this.saveMembers(this.members.filter((x) => x !== agentId));
  }

  async renameMeeting(id: string, title: string) {
    await api.renameMeeting(id, title);
    await this.refreshMeetings();
  }

  async deleteMeeting(id: string) {
    this.speaker.cancel();
    await api.deleteMeeting(id);
    if (this.meeting?.id === id) {
      this.meeting = null;
      this.transcript = [];
      board.clear();
    }
    await this.refreshMeetings();
    this.idle();
  }

  // ---------------------------------------------------------------- voz y chat

  /**
   * El botón del micrófono: si los directores hablan o piensan, interrumpe (corta la voz y la respuesta y vuelve a escuchar);
   * si no, silencia o reactiva el micrófono, que por defecto está siempre escuchando.
   */
  async toggleMic() {
    if (!this.meeting) return this.onError('Open or create a meeting first.');
    if (this.seated.length === 0) return this.onError('The table is empty: add a director.');
    this.micBlocked = false;
    if (this.generating || this.speaker.busy) {
      this.speaker.cancel();
      this.abort?.abort();
      bridge.speakerId = null;
      bridge.thinkingId = null;
      this.changed();
      return;
    }
    this.handsFree = !this.handsFree;
    try {
      if (this.handsFree) localStorage.removeItem('boardroom.mic.muted');
      else localStorage.setItem('boardroom.mic.muted', '1');
    } catch {
      // sin almacenamiento
    }
    if (!this.handsFree) {
      this.listener.cancel();
      bridge.micActive = false;
      bridge.micLevel = 0;
    }
    this.idle();
    this.changed();
  }

  async send(text: string) {
    const meeting = this.meeting;
    if (!meeting) return;
    // órdenes cortas para la pizarra («amplía», «siguiente»…): se ejecutan aquí y no van al comité
    const cmd = boardCommand(text);
    if (cmd) {
      bridge.subtitle = `Whiteboard: ${cmd}`;
      this.changed();
      this.resumeListening(); // una orden de pizarra no abre turno: se sigue escuchando
      return;
    }
    if (this.generating) return;
    this.listener.cancel(); // al escribir un mensaje se deja de escuchar mientras responden
    if (this.seated.length === 0) return this.onError('The table is empty: add a director.');
    this.generating = true;
    this.abort = new AbortController();
    // la sala «late» hasta que llega la primera palabra de algún director
    let waiting = true;
    bridge.busy++;
    const stopWaiting = () => {
      if (!waiting) return;
      waiting = false;
      bridge.busy--;
    };
    bridge.subtitle = `You: ${text}`;
    bridge.status = 'The directors are listening…';
    this.transcript.push({ who: 'You', text, me: true });
    this.changed();

    const live = new Map<string, number>(); // agentId → índice en transcript
    const streams = new Map<string, SentenceStream>(); // agentId → frases pendientes de locutar
    const notes = new Set<string>(); // directores que ya han avisado de que consultan sus apuntes
    const say = (agentId: string, chunks: string[]) => {
      const voice = this.agents.find((a) => a.id === agentId)?.voice ?? '';
      for (const t of chunks) this.speaker.enqueue({ agentId, text: t, voice });
    };
    const handle = (e: TurnEvent) => {
      if (e.type === 'speaker') {
        this.transcript.push({ who: `${e.name} (${e.title})`, text: '' });
        live.set(e.agentId, this.transcript.length - 1);
        streams.set(e.agentId, new SentenceStream());
        if (!this.speaker.busy) {
          bridge.speakerId = e.agentId;
          bridge.status = `${e.name} is thinking…`;
        }
      } else if (e.type === 'thinking') {
        // consulta fuentes o colegas: mira sus apuntes y avisa (una sola vez por intervención)
        if (!notes.has(e.agentId)) {
          notes.add(e.agentId);
          bridge.thinkingId = e.agentId;
          const phrase = this.notePhrase();
          bridge.subtitle = phrase;
          if (this.speaker.enabled) say(e.agentId, [phrase]);
        }
      } else if (e.type === 'delta') {
        stopWaiting();
        const i = live.get(e.agentId);
        const line = i === undefined ? undefined : this.transcript[i];
        if (bridge.thinkingId === e.agentId) bridge.thinkingId = null;
        if (line) line.text += e.text;
        // la voz arranca con la primera frase completa, sin esperar a que termine el mensaje
        if (this.speaker.enabled && line) say(e.agentId, streams.get(e.agentId)?.push(line.text) ?? []);
        else if (line) bridge.subtitle = line.text;
      } else if (e.type === 'message') {
        if (bridge.thinkingId === e.agentId) bridge.thinkingId = null;
        // se vacía sobre el texto tal cual llegó en streaming (el del servidor va recortado)
        const i = live.get(e.agentId);
        const full = (i === undefined ? undefined : this.transcript[i])?.text || e.content;
        if (this.speaker.enabled) say(e.agentId, (streams.get(e.agentId) ?? new SentenceStream()).flush(full));
        else bridge.subtitle = e.content;
      } else if (e.type === 'whiteboard') {
        board.add(e.item);
        bridge.status = `${e.item.by.split(' (')[0]} shows on the whiteboard`;
      } else if (e.type === 'highlight') {
        if (board.highlight(e.target)) bridge.status = 'Pointing it out on the whiteboard';
      } else if (e.type === 'notice') {
        this.transcript.push({ who: 'Notice', text: e.message });
        bridge.subtitle = e.message;
      } else if (e.type === 'error') {
        stopWaiting();
        this.onError(e.message);
      }
      this.changed();
    };

    try {
      // lo que el CEO señala en la pizarra (mirada o pellizco) viaja con el mensaje para que sepan a qué se refiere
      const pointing = board.pointing();
      await api.chat(meeting.id, pointing ? `(${pointing}) ${text}` : text, handle, this.abort.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') this.onError((err as Error).message);
    } finally {
      stopWaiting();
      this.generating = false;
      bridge.thinkingId = null;
      if (!this.speaker.busy) this.idle();
      void this.refreshMeetings(); // el servidor puede haber titulado la reunión
    }
  }
}
