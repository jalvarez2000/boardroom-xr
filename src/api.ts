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
/** El sexo del director va en su voz (`female-1`, `male-2`…): de ahí salen también el avatar y la voz TTS. */
export const isFemale = (voice: string) => voice.startsWith('female')
export interface Position { key: string; title: string; description: string; defaultName: string }
export interface Meeting { id: string; title: string; updatedAt: string; /** notas del CEO (solo viene al abrir la reunión) */ notes?: string }
export interface StoredMessage { id: string; role: 'USER' | 'AGENT'; agentId: string | null; speaker: string; content: string }

/** Documento de la reunión: `scope` dice si vale para todas las reuniones (por defecto) o solo para esta. */
export interface DocInfo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** null = aún sin vectorizar (se busca por palabras clave) */
  indexedAt: string | null;
  createdAt: string;
  scope: 'global' | 'meeting';
}

/** Tamaño máximo por fichero (el servidor lo recibe por multipart; el límite de cuerpo de Vercel es ~4,5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Lo que un director enseña en la pizarra (espejo de `lib/whiteboard.ts` en el servidor). */
export type WhiteboardItem = { id: string; agentId: string; by: string; title: string } & (
  | { kind: 'document'; documentId: string; name: string; mimeType: string; excerpt: string }
  | { kind: 'chart'; chartType: 'bar' | 'line' | 'pie'; labels: string[]; series: { name: string; values: number[] }[]; unit?: string }
  | { kind: 'web'; url: string; summary: string }
  | { kind: 'slides'; slides: { title: string; bullets: string[]; notes?: string }[] }
  | { kind: 'notes'; body: string }
);

export type TurnEvent =
  | { type: 'user'; id: string; content: string }
  | { type: 'speaker'; agentId: string; name: string; title: string; voice: string }
  | { type: 'delta'; agentId: string; text: string }
  | { type: 'thinking'; agentId: string }
  | { type: 'message'; id: string; agentId: string; content: string }
  | { type: 'whiteboard'; item: WhiteboardItem }
  /** un director señala algo de la página que se ve (se busca por su texto) */
  | { type: 'highlight'; agentId: string; target: string }
  | { type: 'notice'; message: string }
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
  positions: () => req<{ positions: Position[] }>('/catalog').then((r) => r.positions),
  createAgent: (companyId: string, positionKey: string) =>
    req<{ agent: Agent }>(`/companies/${companyId}/agents`, 'POST', { positionKey }).then((r) => r.agent),
  meeting: (id: string) =>
    req<{ meeting: Meeting; messages: StoredMessage[]; participants: Agent[]; companyAgents: Agent[] }>(`/meetings/${id}`),
  /** Fija los directores presentes en la reunión (solo ellos responden). */
  setParticipants: (id: string, agentIds: string[]) => req(`/meetings/${id}/participants`, 'PUT', { agentIds }),
  /** Cambia el nombre y/o el sexo de un director (el sexo cambia también su voz). */
  updateAgent: (id: string, patch: { name?: string; gender?: 'female' | 'male' }) =>
    req<{ agent: Agent }>(`/agents/${id}`, 'PATCH', patch).then((r) => r.agent),
  /** Documentos que ve la reunión: los de toda la empresa y los exclusivos de ella. */
  meetingDocuments: (id: string) => req<{ documents: DocInfo[] }>(`/meetings/${id}/documents`).then((r) => r.documents),
  /** Sube un fichero (Blob + vectorización en el servidor). Por defecto `global`; `meeting` = solo esta reunión. */
  async uploadDocument(meetingId: string, file: File, scope: 'global' | 'meeting'): Promise<DocInfo> {
    const form = new FormData();
    form.append('file', file);
    form.append('scope', scope);
    const res = await fetch(`${BASE_URL}/api/v1/meetings/${meetingId}/documents`, { method: 'POST', headers: headers(false), body: form });
    const data = (await res.json().catch(() => ({}))) as { error?: string; documents?: DocInfo[] };
    if (!res.ok || !data.documents?.[0]) throw new Error(data.error ?? `Could not upload (${res.status})`);
    return data.documents[0];
  },
  setDocumentScope: (docId: string, scope: 'global' | 'meeting', meetingId: string) =>
    req<{ document: DocInfo }>(`/documents/${docId}`, 'PATCH', { scope, meetingId }).then((r) => r.document),
  /** Borra el documento, sus fragmentos vectorizados y el original de Vercel Blob. */
  deleteDocument: (docId: string) => req(`/documents/${docId}`, 'DELETE'),
  renameMeeting: (id: string, title: string) => req(`/meetings/${id}`, 'PATCH', { title }),
  /** Guarda las notas de la reunión; `keepalive` deja que la petición termine aunque se cierre la página. */
  async saveNotes(id: string, notes: string, keepalive = false) {
    const res = await fetch(`${BASE_URL}/api/v1/meetings/${id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ notes }),
      keepalive: keepalive && notes.length < 30_000, // el límite de keepalive es ~64 KB
    });
    if (!res.ok) throw new Error(`Could not save the notes (${res.status})`);
  },
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

  /** Original de un documento de la empresa (para descargarlo desde la pizarra). */
  async downloadDocument(id: string): Promise<Blob> {
    const res = await fetch(`${BASE_URL}/api/v1/documents/${id}/download`, { headers: headers(false) });
    if (!res.ok) throw new Error(`Could not download (${res.status})`);
    return res.blob();
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
    fd.append('audio', audio, 'voice.webm');
    const res = await fetch(`${BASE_URL}/api/v1/voice/transcribe`, { method: 'POST', headers: headers(false), body: fd });
    const d = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok) throw new Error(d.error ?? `STT ${res.status}`);
    return d.text ?? '';
  },
};
