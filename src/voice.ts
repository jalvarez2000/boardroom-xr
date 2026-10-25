import { api } from './api.js';

// ---------------------------------------------------------------- entrada de voz
//
// IWSDK / WebXR no ofrecen una API de micrófono o dictado para las Meta VR Glasses
// (su entrada principal es mirada + pellizco). Se usan APIs web estándar:
//   1) Web Speech API (SpeechRecognition) si el navegador la trae → sin coste ni latencia de subida.
//   2) Si no existe o falla: getUserMedia + MediaRecorder y transcripción en el servidor
//      (POST /api/v1/voice/transcribe).

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

const SR: (new () => SpeechRecognitionLike) | undefined =
  (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

export class Listener {
  private rec: SpeechRecognitionLike | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private resolve: ((text: string) => void) | null = null;
  private text = '';
  private useServer = !SR;
  active = false;

  /** Empieza a escuchar. Devuelve el texto cuando se llama a `stop()` (o al callar el usuario con Web Speech). */
  start(onInterim?: (text: string) => void): Promise<string> {
    this.active = true;
    this.text = '';
    return new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      if (!this.useServer && SR) {
        const rec = new SR();
        this.rec = rec;
        rec.lang = 'es-ES';
        rec.interimResults = true;
        rec.continuous = false;
        rec.onresult = (e) => {
          let t = '';
          for (let i = 0; i < e.results.length; i++) t += e.results[i]?.[0]?.transcript ?? '';
          this.text = t;
          onInterim?.(t);
        };
        rec.onerror = (e) => {
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          // not-allowed / service-not-allowed / network / audio-capture → pasamos al servidor
          this.rec = null;
          this.useServer = true;
          this.startRecorder().catch(reject);
        };
        rec.onend = () => {
          if (this.rec === rec) this.finish(this.text);
        };
        try {
          rec.start();
        } catch {
          this.useServer = true;
          this.startRecorder().catch(reject);
        }
      } else {
        this.startRecorder().catch(reject);
      }
    });
  }

  private async startRecorder(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    const rec = new MediaRecorder(this.stream);
    this.recorder = rec;
    rec.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      let text = '';
      if (blob.size > 1500) {
        try {
          text = await api.transcribe(blob);
        } catch (e) {
          console.warn('transcripción fallida', e);
        }
      }
      this.finish(text);
    };
    rec.start();
    // seguridad: máx. 30 s de grabación
    setTimeout(() => this.recorder === rec && rec.state === 'recording' && rec.stop(), 30_000);
  }

  /** Termina la escucha; la promesa de `start()` se resuelve con lo dicho. */
  stop(): void {
    if (this.rec) {
      const r = this.rec;
      try {
        r.stop();
      } catch {
        this.finish(this.text);
      }
    } else if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.stop();
    } else {
      this.finish(this.text);
    }
  }

  private finish(text: string): void {
    const done = this.resolve;
    this.resolve = null;
    this.rec = null;
    this.recorder = null;
    this.active = false;
    done?.(text.trim());
  }
}

// ---------------------------------------------------------------- salida de voz

interface Utterance {
  agentId: string;
  text: string;
  voice: string;
}

/** Cola de locuciones: cada director habla con su voz (TTS del servidor; si falla, speechSynthesis). */
export class Speaker {
  private queue: Utterance[] = [];
  private playing = false;
  private audio: HTMLAudioElement | null = null;
  private epoch = 0;
  enabled = true;
  onPlay: (u: Utterance) => void = () => {};
  onIdle: () => void = () => {};

  get busy(): boolean {
    return this.playing || this.queue.length > 0;
  }

  enqueue(u: Utterance): void {
    this.queue.push(u);
    if (!this.playing) void this.next();
  }

  /** Corta lo que suena y vacía la cola (p. ej. el CEO interrumpe). */
  cancel(): void {
    this.epoch++;
    this.queue = [];
    this.audio?.pause();
    this.audio = null;
    window.speechSynthesis?.cancel();
    if (this.playing) {
      this.playing = false;
      this.onIdle();
    }
  }

  private async next(): Promise<void> {
    const u = this.queue.shift();
    if (!u) {
      this.playing = false;
      this.onIdle();
      return;
    }
    const epoch = this.epoch;
    this.playing = true;
    this.onPlay(u);
    try {
      const blob = await api.speak(u.text, u.voice);
      if (epoch !== this.epoch) return;
      await this.play(URL.createObjectURL(blob), epoch);
    } catch {
      if (epoch !== this.epoch) return;
      await this.fallback(u, epoch);
    }
    if (epoch === this.epoch) void this.next();
  }

  private play(url: string, epoch: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const a = new Audio(url);
      this.audio = a;
      const end = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      a.onended = end;
      a.onerror = () => reject(new Error('audio'));
      a.play().catch(reject);
      // si se cancela, la promesa no se queda colgada
      const iv = setInterval(() => {
        if (epoch !== this.epoch) {
          clearInterval(iv);
          end();
        } else if (a.ended) clearInterval(iv);
      }, 200);
    });
  }

  private fallback(u: Utterance, epoch: number): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || epoch !== this.epoch) return resolve();
      const msg = new SpeechSynthesisUtterance(u.text);
      msg.lang = 'es-ES';
      const voices = synth.getVoices().filter((v) => v.lang.startsWith('es'));
      const wantFemale = u.voice.startsWith('female');
      msg.voice =
        voices.find((v) => (wantFemale ? /female|mujer|monica|paulina|lucia|helena/i : /male|hombre|jorge|diego|pablo/i).test(v.name)) ??
        voices[0] ??
        null;
      msg.onend = () => resolve();
      msg.onerror = () => resolve();
      synth.speak(msg);
    });
  }
}
