// Cliente de la API de Boardroom (/api/v1). Autenticación por Bearer (sin cookies).

export const BASE_URL: string =
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_BOARDROOM_URL ??
  localStorage.getItem('boardroom.url') ??
  'http://localhost:3000';

const TOKEN_KEY = 'boardroom.token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

export interface Company { id: string; name: string; industry: string; description: string; maxAgents: number }
export interface Agent { id: string; name: string; title: string; voice: string }
export interface Meeting { id: string; title: string; updatedAt: string }
export interface StoredMessage { id: string; role: 'USER' | 'AGENT'; agentId: string | null; speaker: string; content: string }

export type TurnEvent =
  | { type: 'user'; id: string; content: string }
  | { type: 'speaker'; agentId: string; name: string; title: string; voice: string }
  | { type: 'delta'; agentId: string; text: string }
  | { type: 'message'; id: string; agentId: string; content: string }
  | { type: 'error'; message: string }
  | { type: 'end' };

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {};
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers: headers(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

export const api = {
  async login(email: string, password: string) {
    const r = await req<{ token: string; user: { name: string; role: string } }>('/auth/login', 'POST', { email, password });
    setToken(r.token);
    return r.user;
  },
  me: () => req<{ user: { name: string; role: string } }>('/me'),
  companies: () => req<{ companies: Company[] }>('/companies').then((r) => r.companies),
  company: (id: string) =>
    req<{ company: Company; agents: Agent[]; meetings: Meeting[] }>(`/companies/${id}`),
  createMeeting: (companyId: string, title?: string) =>
    req<{ meeting: Meeting }>(`/companies/${companyId}/meetings`, 'POST', title ? { title } : {}).then((r) => r.meeting),
  meeting: (id: string) => req<{ meeting: Meeting; messages: StoredMessage[] }>(`/meetings/${id}`),
  renameMeeting: (id: string, title: string) => req(`/meetings/${id}`, 'PATCH', { title }),
  deleteMeeting: (id: string) => req(`/meetings/${id}`, 'DELETE'),

  /** Envía un mensaje y recibe los eventos SSE del turno. */
  async chat(meetingId: string, message: string, onEvent: (e: TurnEvent) => void, signal?: AbortSignal) {
    const res = await fetch(`${BASE_URL}/api/v1/meetings/${meetingId}/chat`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ message }),
      signal,
    });
    if (!res.ok || !res.body) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error ?? `Error ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const raw of parts) {
        const line = raw.replace(/^data: /, '').trim();
        if (line) onEvent(JSON.parse(line) as TurnEvent);
      }
    }
  },

  async speak(text: string, voice: string): Promise<Blob> {
    const res = await fetch(`${BASE_URL}/api/v1/voice/speak`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    return res.blob();
  },

  async transcribe(audio: Blob): Promise<string> {
    const fd = new FormData();
    fd.append('audio', audio, 'voz.webm');
    const res = await fetch(`${BASE_URL}/api/v1/voice/transcribe`, { method: 'POST', headers: headers(false), body: fd });
    const d = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok) throw new Error(d.error ?? `STT ${res.status}`);
    return d.text ?? '';
  },
};
