/** Limpia lo que no se debe leer en voz alta (markdown, URLs). */
export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/[*_`#>~|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const FIRST_MIN = 14; // la primera frase sale pronto para que la voz arranque con el streaming
const FIRST_MAX = 60; // y si en 60 caracteres no hay ni una coma ni un punto, se corta en el último espacio
const NEXT_MIN = 40; // las siguientes, algo más largas para una prosodia natural
const MAX = 160;

/**
 * Parte el texto que llega en streaming en frases para el TTS: se llama con el texto acumulado y
 * devuelve solo las frases nuevas ya completas; `flush` entrega lo que quede al terminar.
 */
export class SentenceStream {
  private used = 0;
  private first = true;

  push(full: string): string[] {
    const out: string[] = [];
    for (;;) {
      const rest = full.slice(this.used);
      const min = this.first ? FIRST_MIN : NEXT_MIN;
      let cut = -1;
      // la primera locución también se corta en comas y rayas: arranca la voz sin esperar a que acabe la primera frase
      const re = this.first ? /[.!?…:;,—–]+["')»]*(?=\s)|\n+/g : /[.!?…:;]+["')»]*(?=\s)|\n+/g;
      for (let m = re.exec(rest); m; m = re.exec(rest)) {
        if (m.index + m[0].length >= min) {
          cut = m.index + m[0].length;
          break;
        }
      }
      const limit = this.first ? FIRST_MAX : MAX;
      if (cut < 0 && rest.length > limit) {
        const head = rest.slice(0, limit);
        const soft = Math.max(head.lastIndexOf(', '), head.lastIndexOf(' '));
        cut = soft > min ? soft + 1 : limit;
      }
      if (cut < 0) return out;
      this.take(rest.slice(0, cut), cut, out);
    }
  }

  flush(full: string): string[] {
    const out: string[] = [];
    const rest = full.slice(this.used);
    this.take(rest, rest.length, out);
    return out;
  }

  private take(chunk: string, len: number, out: string[]): void {
    this.used += len;
    const t = speakable(chunk);
    if (/[\p{L}\p{N}]/u.test(t)) {
      out.push(t);
      this.first = false;
    }
  }
}
