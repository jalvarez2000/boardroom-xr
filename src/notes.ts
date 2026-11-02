/** Notas de la reunión que el CEO escribe con el teclado de la mesa; se muestran en el cuaderno y se guardan por reunión. */
const PREFIX = 'boardroom.notes.';
/** Marca que hay cambios locales sin subir al servidor (sobrevive a cerrar la app). */
const DIRTY = 'boardroom.notes.dirty.';
/** Espera tras la última tecla antes de subir las notas. */
const SAVE_DELAY = 1500;

export type SyncState = 'local' | 'pending' | 'saving' | 'saved' | 'error';
const ACCENTS: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' };

class Notes {
  text = '';
  /** pasa a true con la próxima letra en mayúscula (el ⇧ del teclado) */
  shift = false;
  /** tecla muerta ´: la próxima vocal sale acentuada */
  accent = false;
  /** el cuaderno está en las manos del CEO (se lee de cerca) */
  reading = false;
  /** página que se ve al leer; null = la última, que sigue al texto que se escribe */
  page: number | null = null;
  version = 0;
  /** estado de la copia en el servidor (solo hay copia en el servidor dentro de una reunión) */
  sync: SyncState = 'local';
  onChange: () => void = () => {};
  /** sube las notas de una reunión; lo pone Boardroom */
  uploader: ((meetingId: string, text: string, keepalive: boolean) => Promise<void>) | null = null;
  private key = 'none';
  private timer = 0;

  /**
   * Cambia de reunión y carga sus notas: las del servidor (`remote`), salvo que haya cambios locales sin subir
   * (p. ej. se cerró la app sin conexión), que mandan y se suben ahora.
   */
  load(meetingId: string | null, remote?: string): void {
    this.flush(true); // lo pendiente de la reunión anterior no se pierde
    this.key = meetingId ?? 'none';
    let local = '';
    let dirty = false;
    try {
      local = localStorage.getItem(PREFIX + this.key) ?? '';
      dirty = localStorage.getItem(DIRTY + this.key) === '1';
    } catch {
      // sin almacenamiento
    }
    // lo local manda si hay cambios sin subir o si venía de antes de que existiera la copia en el servidor
    if (meetingId && remote !== undefined && remote === '' && local !== '') dirty = true;
    this.text = meetingId && remote !== undefined && !dirty ? remote : local;
    if (dirty) this.markDirty(true);
    this.reading = false;
    this.page = null;
    this.shift = this.accent = false;
    this.sync = !meetingId ? 'local' : dirty ? 'pending' : 'saved';
    this.cache();
    this.changed(false);
    if (meetingId && dirty) this.schedule();
  }

  /** Sube ya lo pendiente (al salir de la reunión o cerrar la página). */
  flush(keepalive = false): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    if (this.key === 'none' || this.sync === 'saved' || this.sync === 'local') return;
    const id = this.key;
    const text = this.text;
    this.sync = 'saving';
    this.uploader?.(id, text, keepalive).then(
      () => {
        // ¿sigue siendo lo último escrito de esa reunión?
        const latest = this.key === id ? this.text : this.readLocal(id);
        if (latest === text) {
          this.markDirty(false, id);
          if (this.key === id) {
            this.sync = 'saved';
            this.changed(false);
          }
        } else if (this.key === id) {
          this.schedule(); // se siguió escribiendo mientras subía
        }
      },
      () => {
        if (this.key === id) {
          this.sync = 'error';
          this.changed(false);
          this.timer = window.setTimeout(() => this.flush(), 10_000); // reintenta
        }
      },
    );
    this.changed(false);
  }

  private readLocal(id: string): string {
    try {
      return localStorage.getItem(PREFIX + id) ?? '';
    } catch {
      return '';
    }
  }

  private markDirty(on: boolean, id = this.key): void {
    try {
      if (on) localStorage.setItem(DIRTY + id, '1');
      else localStorage.removeItem(DIRTY + id);
    } catch {
      // nada
    }
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    if (this.sync !== 'saving') this.sync = 'pending';
    this.timer = window.setTimeout(() => this.flush(), SAVE_DELAY);
  }

  private cache(): void {
    try {
      localStorage.setItem(PREFIX + this.key, this.text);
    } catch {
      // las notas viven mientras la app esté abierta
    }
  }

  /** Aplica ⇧ y la tecla muerta a un carácter del teclado (y los consume). Lo usan las notas y el editor de directores. */
  compose(ch: string): string {
    let c = ch;
    if (this.shift && /\p{L}/u.test(c)) c = c.toUpperCase();
    if (this.accent) {
      c = ACCENTS[c] ?? c;
      this.accent = false;
    }
    this.shift = false;
    return c;
  }

  /** Escribe un carácter (aplica ⇧ y la tecla muerta). */
  type(ch: string): void {
    const c = this.compose(ch);
    this.text += c;
    this.page = null;
    this.changed();
  }

  /** Sustituye el texto entero (lo usa el teclado del sistema, que entrega el texto escrito de golpe). */
  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.page = null;
    this.changed();
  }

  newline(): void {
    this.text += '\n';
    this.page = null;
    this.changed();
  }

  backspace(): void {
    this.text = Array.from(this.text).slice(0, -1).join('');
    this.page = null;
    this.changed();
  }

  toggleShift(): void {
    this.shift = !this.shift;
    this.changed(false);
  }

  toggleAccent(): void {
    this.accent = !this.accent;
    this.changed(false);
  }

  toggleReading(on = !this.reading): void {
    this.reading = on;
    this.changed(false);
  }

  /** Páginas que ocupa el texto y la que se ve (las rellena el cuaderno al dibujarse). */
  pageCount = 1;
  pageNow = 0;

  /** Pasa de página al leer (la primera/última se quedan donde están). */
  step(delta: number): void {
    this.page = Math.max(0, Math.min(this.pageCount - 1, this.pageNow + delta));
    this.changed(false);
  }

  private changed(save = true): void {
    if (save) {
      this.cache();
      if (this.key !== 'none') {
        this.markDirty(true);
        this.schedule();
      }
    }
    this.version++;
    this.onChange();
  }
}

export const notes = new Notes();

// al cerrar o esconder la página, lo pendiente sale ya (keepalive deja terminar la petición)
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => notes.flush(true));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && notes.flush(true));
}
