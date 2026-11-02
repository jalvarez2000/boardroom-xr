import { api } from './api.js';

/** Micrófono abierto todo el rato: detecta cuándo habla el usuario, cuándo se calla y qué ha dicho. */

const RATE = 16000; // se envía a 16 kHz mono (32 KB/s): sobra para transcribir y cabe de sobra en los 4 MB del servidor
const END_SILENCE_MS = 2000; // tras 2 s callado se da por terminada la frase y los directores contestan
const SPECULATE_MS = 900; // a los 0,9 s callado ya se empieza a transcribir; si sigue callado se aprovecha ese trabajo
const KEEP_TAIL_MS = 300; // del silencio final solo se envía un poco
const PREROLL_MS = 450; // lo anterior al primer sonido que se detecta, para no perder la primera sílaba
const MAX_UTTERANCE_MS = 30_000;
const MIN_VOICED_MS = 250; // menos que eso es un ruido, no una frase
const START_MS = 120;
const START_MS_WHILE_TALKING = 320; // mientras los directores hablan hace falta una voz clara y sostenida para interrumpirles
const THR = 0.025; // nivel (RMS) por encima del cual hay voz
const THR_WHILE_TALKING = 0.06;

interface Chunk {
  pcm: Int16Array;
  ms: number;
}

export class OpenMic {
  /** nivel 0..1 para la señal visual de «te oigo» */
  onLevel: (level: number) => void = () => {};
  /** true cuando empieza a hablar el usuario, false cuando termina su frase */
  onSpeaking: (speaking: boolean) => void = () => {};
  /** el usuario empezó a hablar mientras los directores hablaban o pensaban */
  onBargeIn: () => void = () => {};
  /** frase terminada, ya transcrita */
  onUtterance: (text: string) => void = () => {};
  /** ¿hablan ahora los directores? (sube el umbral para que su propia voz no les interrumpa) */
  isPlaying: () => boolean = () => false;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private starting = false;

  private pre: Chunk[] = [];
  private buf: Chunk[] = [];
  private inUtt = false;
  private voicedRun = 0;
  private voicedMs = 0;
  private silenceMs = 0;
  private bufMs = 0;
  private floor = 0; // ruido de fondo estimado
  private spec: Promise<string> | null = null;

  get running(): boolean {
    return !!this.stream || this.starting;
  }

  /** Abre el micrófono (puede lanzar si el navegador no lo permite). */
  async start(): Promise<void> {
    if (this.running) return;
    this.starting = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = (e) => this.process(e.inputBuffer.getChannelData(0), ctx.sampleRate);
      source.connect(node);
      node.connect(ctx.destination); // no escribe salida: queda en silencio, pero hace falta para que se procese
      this.stream = stream;
      this.ctx = ctx;
      this.source = source;
      this.node = node;
      this.reset();
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    const wasSpeaking = this.inUtt;
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => {});
    this.node = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;
    this.reset();
    this.onLevel(0);
    if (wasSpeaking) this.onSpeaking(false);
  }

  private reset(): void {
    this.pre = [];
    this.buf = [];
    this.inUtt = false;
    this.voicedRun = 0;
    this.voicedMs = 0;
    this.silenceMs = 0;
    this.bufMs = 0;
    this.spec = null;
  }

  private process(input: Float32Array, rate: number): void {
    const ms = (input.length / rate) * 1000;
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += (input[i] as number) ** 2;
    const rms = Math.sqrt(sum / input.length);
    this.onLevel(Math.min(1, rms * 6));

    const talking = this.isPlaying();
    // el umbral sube con el ruido de fondo (ventilador, sala…) para no quedarse «oyendo» eternamente
    const thr = talking ? THR_WHILE_TALKING : Math.max(THR, this.floor * 2.5);
    const voiced = rms > thr;
    if (!voiced && !this.inUtt) this.floor = this.floor * 0.97 + rms * 0.03;
    const chunk: Chunk = { pcm: this.down(input, rate), ms };

    if (!this.inUtt) {
      this.pre.push(chunk);
      let total = 0;
      for (const c of this.pre) total += c.ms;
      while (total > PREROLL_MS && this.pre.length > 1) total -= (this.pre.shift() as Chunk).ms;
      this.voicedRun = voiced ? this.voicedRun + ms : 0;
      if (this.voicedRun >= (talking ? START_MS_WHILE_TALKING : START_MS)) {
        this.inUtt = true;
        this.buf = this.pre;
        this.pre = [];
        this.bufMs = total;
        this.voicedMs = this.voicedRun;
        this.silenceMs = 0;
        this.spec = null;
        this.onSpeaking(true);
        if (talking) this.onBargeIn();
      }
      return;
    }

    this.buf.push(chunk);
    this.bufMs += ms;
    if (voiced) {
      this.voicedMs += ms;
      this.silenceMs = 0;
      this.spec = null; // siguió hablando: lo que se había adelantado ya no vale
    } else {
      this.silenceMs += ms;
    }
    if (!this.spec && this.silenceMs >= SPECULATE_MS && this.voicedMs >= MIN_VOICED_MS) {
      this.spec = this.transcribe(this.snapshot());
    }
    if (this.silenceMs >= END_SILENCE_MS || this.bufMs >= MAX_UTTERANCE_MS) this.finish();
  }

  private finish(): void {
    const voiced = this.voicedMs;
    const text = voiced >= MIN_VOICED_MS ? (this.spec ?? this.transcribe(this.snapshot())) : null;
    this.reset();
    this.onSpeaking(false);
    if (!text) return;
    void text.then((t) => {
      const clean = t.trim();
      if (/[\p{L}\p{N}]/u.test(clean)) this.onUtterance(clean);
    });
  }

  /** Lo grabado hasta ahora, recortando el silencio del final. */
  private snapshot(): Blob {
    let drop = Math.max(0, this.silenceMs - KEEP_TAIL_MS);
    const chunks = this.buf.slice();
    while (drop > 0 && chunks.length > 1 && (chunks[chunks.length - 1] as Chunk).ms <= drop) drop -= (chunks.pop() as Chunk).ms;
    return wav(chunks);
  }

  private async transcribe(blob: Blob): Promise<string> {
    try {
      return await api.transcribe(blob, 'voice.wav');
    } catch (e) {
      console.warn('transcription failed', e);
      return '';
    }
  }

  /** Reduce a 16 kHz promediando muestras. */
  private down(input: Float32Array, rate: number): Int16Array {
    const ratio = rate / RATE;
    const n = Math.floor(input.length / ratio);
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio);
      const b = Math.min(input.length, Math.floor((i + 1) * ratio));
      let s = 0;
      for (let j = a; j < b; j++) s += input[j] as number;
      out[i] = Math.max(-1, Math.min(1, s / Math.max(1, b - a))) * 32767;
    }
    return out;
  }
}

/** WAV de 16 bits, mono, 16 kHz. */
function wav(chunks: Chunk[]): Blob {
  let n = 0;
  for (const c of chunks) n += c.pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.pcm.length; i++, o += 2) v.setInt16(o, c.pcm[i] as number, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
