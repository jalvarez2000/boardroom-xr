/**
 * Puente entre la capa de red/voz (DOM, Boardroom) y la escena 3D.
 * El `MeetingSystem` lo lee en cada frame; los módulos de red lo escriben.
 */
export interface BridgeAgent {
  id: string;
  name: string;
  title: string;
  voice: string;
}

/** Lo que muestra la tablet 3D (la interfaz dentro de XR). */
export interface TabletView {
  page: 'login' | 'list' | 'meeting' | 'docs';
  title: string;
  /** documentos de la reunión (los primeros, para la tablet) */
  docs: { id: string; name: string; global: boolean }[];
  docCount: number;
  /** micrófono siempre escuchando (true) o silenciado (false) */
  listening: boolean;
  /** página de documentos que se ve (0-based) y cuántas hay */
  docPage: number;
  docPages: number;
  meetings: { id: string; title: string }[];
  log: string;
  voice: boolean;
}

export const bridge = {
  /** sale de la sesión XR (para abrir el selector de ficheros, que solo existe fuera de XR) */
  endXr: (() => {}) as () => void,
  /** true cuando hay una reunión real conectada (desactiva el parloteo aleatorio de la demo) */
  connected: false,
  /** incrementa al cambiar `agents`, para que la escena reasigne asientos */
  agentsVersion: 0,
  agents: [] as BridgeAgent[],
  /** agente que está hablando ahora (null = nadie) */
  speakerId: null as string | null,
  /** director que está razonando la respuesta (mira sus apuntes) hasta que llega su primer texto */
  thinkingId: null as string | null,
  /** operaciones en curso que esperan al servidor (login, abrir reunión, respuesta…); > 0 = la sala lo muestra */
  busy: 0,
  /** true mientras suena una locución (distingue «habla» de «sigue pensando») */
  talking: false,
  /** estado corto en la tablet: «Tu turno · pulsa Hablar», «Marta Ruiz habla»… */
  status: 'Meeting room',
  /** texto parcial del dictado o último aviso, mientras no se pinta en la transcripción */
  subtitle: '',
  micActive: false,
  /** nivel del micrófono (0..1) para el aviso visual de «te oigo» */
  micLevel: 0,
  view: { page: 'login', title: 'Boardroom', docs: [], docCount: 0, listening: true, docPage: 0, docPages: 1, meetings: [], log: '', voice: true } as TabletView,
  /** incrementa al cambiar `view` */
  viewVersion: 0,
  /** la tablet 3D llama a estos callbacks (gaze + pinch / rayo) */
  onMic: (() => {}) as () => void,
  onNewMeeting: (() => {}) as () => void,
  onOpenMeeting: ((_id: string) => {}) as (id: string) => void,
  onBack: (() => {}) as () => void,
  onToggleVoice: (() => {}) as () => void,
  /** tocar la etiqueta de un director abre su editor (nombre y sexo) */
  onEditAgent: ((_id: string) => {}) as (id: string) => void,
  onOpenDocs: (() => {}) as () => void,
  onCloseDocs: (() => {}) as () => void,
  onDocsPage: ((_delta: number) => {}) as (delta: number) => void,
  /** en XR no hay selector de ficheros: se sale de XR y se abre el formulario de subida */
  onUploadDocs: (() => {}) as () => void,
  onToggleDocScope: ((_id: string) => {}) as (id: string) => void,
  onDeleteDoc: ((_id: string) => {}) as (id: string) => void,
};

export function setAgents(agents: BridgeAgent[]): void {
  bridge.agents = agents;
  bridge.agentsVersion++;
}
