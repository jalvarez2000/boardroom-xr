import { api, type Agent, type Company, type Meeting, type TurnEvent, getToken, setToken } from './api.js';
import { bridge, setAgents } from './bridge.js';
import { Listener, Speaker } from './voice.js';

/**
 * Controlador de la reunión: une API (empresas, reuniones, chat), voz (STT/TTS),
 * el panel 3D (vía `bridge`) y la interfaz DOM.
 */
export class Boardroom {
  private listener = new Listener();
  private speaker = new Speaker();
  private abort: AbortController | null = null;
  private generating = false;

  companies: Company[] = [];
  company: Company | null = null;
  agents: Agent[] = [];
  meetings: Meeting[] = [];
  meeting: Meeting | null = null;
  /** líneas visibles en la transcripción DOM */
  transcript: { who: string; text: string; me?: boolean }[] = [];
  onChange: () => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor() {
    this.speaker.onPlay = (u) => {
      bridge.speakerId = u.agentId;
      const a = this.agents.find((x) => x.id === u.agentId);
      bridge.status = `${a?.name ?? 'Director'} habla`;
      bridge.subtitle = u.text;
    };
    this.speaker.onIdle = () => {
      if (!this.generating) this.idle();
    };
    bridge.onMic = () => void this.toggleMic();
    bridge.onNewMeeting = () => void this.newMeeting();
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

  private idle() {
    bridge.speakerId = null;
    bridge.status = this.meeting ? 'Tu turno · pulsa Hablar' : 'Elige una reunión';
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

  async login(email: string, password: string) {
    await api.login(email, password);
    await this.loadCompanies();
  }

  logout() {
    setToken(null);
    this.speaker.cancel();
    this.companies = [];
    this.company = null;
    this.meeting = null;
    this.agents = [];
    this.meetings = [];
    this.transcript = [];
    bridge.connected = false;
    setAgents([]);
    bridge.status = 'Sala de reuniones';
    bridge.subtitle = '';
    this.onChange();
  }

  async loadCompanies() {
    this.companies = await api.companies();
    const first = this.companies[0];
    if (first) await this.selectCompany(first.id);
    else this.onChange();
  }

  async selectCompany(id: string) {
    this.speaker.cancel();
    const r = await api.company(id);
    this.company = r.company;
    this.agents = r.agents;
    this.meetings = r.meetings;
    this.meeting = null;
    this.transcript = [];
    bridge.connected = true;
    bridge.subtitle = '';
    setAgents(r.agents.slice(0, 5));
    this.idle();
    this.onChange();
  }

  async selectMeeting(id: string) {
    this.speaker.cancel();
    const r = await api.meeting(id);
    this.meeting = this.meetings.find((m) => m.id === id) ?? { ...r.meeting, updatedAt: r.meeting.updatedAt };
    this.transcript = r.messages.map((m) =>
      m.role === 'USER' ? { who: 'Tú', text: m.content, me: true } : { who: m.speaker, text: m.content },
    );
    bridge.meetingTitle = this.meeting.title;
    bridge.subtitle = '';
    this.idle();
    this.onChange();
  }

  private async refreshMeetings() {
    if (!this.company) return;
    this.meetings = (await api.company(this.company.id)).meetings;
    if (this.meeting) {
      const m = this.meetings.find((x) => x.id === this.meeting?.id);
      if (m) this.meeting = m;
    }
    this.onChange();
  }

  async newMeeting() {
    if (!this.company) return;
    if (this.agents.length === 0) return this.onError('La empresa no tiene directores.');
    const m = await api.createMeeting(this.company.id);
    await this.refreshMeetings();
    await this.selectMeeting(m.id);
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
    }
    await this.refreshMeetings();
    this.idle();
  }

  // ---------------------------------------------------------------- voz y chat

  async toggleMic() {
    if (!this.meeting) return this.onError('Abre o crea una reunión primero.');
    if (this.listener.active) {
      this.listener.stop(); // la promesa de start() envía el mensaje
      return;
    }
    // el CEO interrumpe: corta lo que esté sonando y la respuesta en curso
    this.speaker.cancel();
    this.abort?.abort();
    bridge.speakerId = null;
    bridge.micActive = true;
    bridge.status = 'Te escucho…';
    this.onChange();
    try {
      const text = await this.listener.start((t) => {
        bridge.subtitle = t;
      });
      bridge.micActive = false;
      this.onChange();
      if (text) await this.send(text);
      else this.idle();
    } catch (e) {
      bridge.micActive = false;
      this.idle();
      this.onError(`Micrófono no disponible: ${(e as Error).message}`);
    }
  }

  async send(text: string) {
    const meeting = this.meeting;
    if (!meeting || this.generating) return;
    this.generating = true;
    this.abort = new AbortController();
    bridge.subtitle = `Tú: ${text}`;
    bridge.status = 'Los directores te escuchan…';
    this.transcript.push({ who: 'Tú', text, me: true });
    this.onChange();

    const live = new Map<string, number>(); // agentId → índice en transcript
    const handle = (e: TurnEvent) => {
      if (e.type === 'speaker') {
        this.transcript.push({ who: `${e.name} (${e.title})`, text: '' });
        live.set(e.agentId, this.transcript.length - 1);
        if (!this.speaker.busy) {
          bridge.speakerId = e.agentId;
          bridge.status = `${e.name} está pensando…`;
        }
      } else if (e.type === 'delta') {
        const i = live.get(e.agentId);
        const line = i === undefined ? undefined : this.transcript[i];
        if (line) line.text += e.text;
        if (!this.speaker.enabled && line) bridge.subtitle = line.text;
      } else if (e.type === 'message') {
        const agent = this.agents.find((a) => a.id === e.agentId);
        if (this.speaker.enabled) this.speaker.enqueue({ agentId: e.agentId, text: e.content, voice: agent?.voice ?? '' });
        else bridge.subtitle = e.content;
      } else if (e.type === 'error') {
        this.onError(e.message);
      }
      this.onChange();
    };

    try {
      await api.chat(meeting.id, text, handle, this.abort.signal);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') this.onError((err as Error).message);
    } finally {
      this.generating = false;
      if (!this.speaker.busy) this.idle();
      void this.refreshMeetings(); // el servidor puede haber titulado la reunión
    }
  }
}
