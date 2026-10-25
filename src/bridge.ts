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

export const bridge = {
  /** true cuando hay una reunión real conectada (desactiva el parloteo aleatorio de la demo) */
  connected: false,
  /** incrementa al cambiar `agents`, para que la escena reasigne asientos */
  agentsVersion: 0,
  agents: [] as BridgeAgent[],
  /** agente que está hablando ahora (null = nadie) */
  speakerId: null as string | null,
  /** estado corto en el panel: «Escuchando…», «Marta Ruiz habla»… */
  status: 'Sala de reuniones',
  subtitle: '',
  micActive: false,
  meetingTitle: '',
  /** el sistema 3D llama a estos callbacks al pulsar los botones del panel (gaze + pinch / rayo) */
  onMic: (() => {}) as () => void,
  onNewMeeting: (() => {}) as () => void,
};

export function setAgents(agents: BridgeAgent[]): void {
  bridge.agents = agents;
  bridge.agentsVersion++;
}
