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
  /** nivel del micrófono (0..1) mientras se graba en modo servidor; en Web Speech no hay nivel */
  level = 0;
  onLevel: (level: number) => void = () => {};
  private cancelled = false;
  private heard = true;
  private meter: number | null = null;
  private audioCtx: AudioContext | null = null;

  /** Empieza a escuchar. Devuelve el texto cuando se llama a `stop()` (o al callar el usuario con Web Speech). */
  start(onInterim?: (text: string) => void): Promise<string> {
    this.active = true;
    this.cancelled = false;
    this.text = '';
    return new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      if (!this.useServer && SR) {
        const rec = new SR();
        this.rec = rec;
        rec.lang = 'en-US';
        rec.interimResults = true;
        rec.continuous = false;
        // si el dictado del navegador no da ni una palabra en 5 s (en algunas sesiones XR no responde), se graba y se transcribe en el servidor
        const watchdog = window.setTimeout(() => {
          if (this.rec !== rec || this.text) return;
          this.rec = null;
          this.useServer = true;
          try {
            rec.abort();
          } catch {
            // nada
          }
          this.startRecorder().catch(reject);
        }, 5000);
        rec.onresult = (e) => {
          window.clearTimeout(watchdog);
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
          window.clearTimeout(watchdog);
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
    this.heard = true; // sin medidor de nivel (analizador no disponible) se transcribe siempre
    rec.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
    rec.onstop = async () => {
      this.stopMeter();
      const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      let text = '';
      // sin voz (o cancelado) no se gasta una transcripción
      if (blob.size > 1500 && this.heard && !this.cancelled) {
        try {
          text = await api.transcribe(blob);
        } catch (e) {
          console.warn('transcription failed', e);
        }
      }
      this.finish(text);
    };
    rec.start();
    this.watchLevel(rec);
    // seguridad: máx. 30 s de grabación
    setTimeout(() => this.recorder === rec && rec.state === 'recording' && rec.stop(), 30_000);
  }

  /**
   * Mide el nivel del micrófono: da la señal visual de que te oye y corta la grabación sola cuando dejas de hablar
   * (sin esto había que volver a pulsar Hablar y parecía que no pasaba nada).
   */
  private watchLevel(rec: MediaRecorder): void {
    if (!this.stream) return;
    try {
      const ctx = new AudioContext();
      this.audioCtx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(this.stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const t0 = performance.now();
      let lastVoice = 0;
      let heard = false;
      this.heard = false;
      this.meter = window.setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        this.level = Math.min(1, rms * 6);
        this.onLevel(this.level);
        const now = performance.now();
        if (rms > 0.02) {
          heard = true;
          this.heard = true;
          lastVoice = now;
        }
        if (rec.state !== 'recording') return;
        if (heard && now - lastVoice > 1300) rec.stop(); // dejó de hablar
        else if (!heard && now - t0 > 9000) rec.stop(); // nunca habló
      }, 100);
    } catch {
      // sin análisis de audio: se graba igual y se corta al pulsar de nuevo
    }
  }

  private stopMeter(): void {
    if (this.meter !== null) window.clearInterval(this.meter);
    this.meter = null;
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.level = 0;
    this.onLevel(0);
  }

  /** Corta la escucha sin enviar nada (silenciar el micrófono). */
  cancel(): void {
    this.cancelled = true;
    this.text = '';
    this.stop();
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
    done?.(this.cancelled ? '' : text.trim());
  }
}

// ---------------------------------------------------------------- salida de voz

interface Utterance {
  agentId: string;
  text: string;
  voice: string;
  /** audio ya pedido al servidor mientras suena lo anterior */
  audio?: Promise<Blob>;
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
    // el TTS de cada frase se pide en cuanto llega, para que no haya hueco entre frases
    u.audio = api.speak(u.text, u.voice);
    u.audio.catch(() => {});
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
      const blob = await (u.audio ?? api.speak(u.text, u.voice));
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
      msg.lang = 'en-US';
      const voices = synth.getVoices().filter((v) => v.lang.startsWith('en'));
      const wantFemale = u.voice.startsWith('female');
      msg.voice =
        voices.find((v) => (wantFemale ? /female|samantha|karen|zira|victoria|moira|tessa|susan|hazel|google us english/i : /\bmale|alex|daniel|david|mark|fred|george|james|ryan/i).test(v.name)) ??
        voices[0] ??
        null;
      msg.onend = () => resolve();
      msg.onerror = () => resolve();
      synth.speak(msg);
    });
  }
}
