/** Tutorial de gestos: se muestra al abrir la app hasta que el usuario marca «No volver a mostrar». */
const KEY = 'boardroom.tutorial.hidden';

export type Gesture = 'tap' | 'swipe-forward' | 'swipe-backward' | 'swipe-left' | 'swipe-right';

export interface TutorialStep {
  title: string;
  body: string;
  /** gesto que se puede probar en este paso (el panel lo reconoce y felicita) */
  tryGesture?: Gesture;
  tryText?: string;
}

export const STEPS: TutorialStep[] = [
  {
    title: 'Look and pinch',
    body: 'Look at a button or a figure: it lights up slightly. Bring your thumb and index finger together to select it.',
  },
  {
    title: 'Thumb tap: mute or interrupt',
    body: 'The microphone is always listening, so just talk. Rest your thumb on the side of your index finger and tap to mute it, or to interrupt a director who is speaking.',
    tryGesture: 'tap',
    tryText: 'Try it: tap with your thumb',
  },
  {
    title: 'Swipe forward or back: zoom',
    body: 'Thumb forward zooms in, backward zooms out. The zoom centres on what you are looking at.',
    tryGesture: 'swipe-forward',
    tryText: 'Try it: swipe your thumb forward',
  },
  {
    title: 'Swipe sideways: pages',
    body: 'Left for the next page, right for the previous one. When zoomed in, it pans the view instead of changing page.',
    tryGesture: 'swipe-left',
    tryText: 'Try it: swipe your thumb left',
  },
  {
    title: 'Point and ask',
    body: 'Look at a figure and pinch to pin it (it turns yellow). Ask out loud: "why is this dropping?". The directors know what you mean.',
  },
  {
    title: 'Keyboard and notebook',
    body: 'Type your notes on the table keyboard: look at each key and pinch. They appear in the notebook on your right. Pinch the notebook (or the Read key) to read it up close; swipe sideways to turn pages.',
  },
  {
    title: 'Voice works too',
    body: 'Say: "zoom in", "zoom out", "full view", "next", "previous", "close the whiteboard" or "download".',
  },
];

class Tutorial {
  visible = this.readHidden() !== '1';
  step = 0;
  dontShow = false;
  /** pasos cuyo gesto ya se probó */
  done = new Set<number>();
  version = 0;
  onChange: () => void = () => {};

  private readHidden(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  private persist(): void {
    try {
      if (this.dontShow) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      // sin almacenamiento: se vuelve a mostrar la próxima vez
    }
  }

  get current(): TutorialStep {
    return STEPS[this.step] ?? STEPS[0]!;
  }

  get last(): boolean {
    return this.step >= STEPS.length - 1;
  }

  open(): void {
    this.step = 0;
    this.done.clear();
    this.dontShow = this.readHidden() === '1';
    this.visible = true;
    this.changed();
  }

  close(): void {
    this.visible = false;
    this.persist();
    this.changed();
  }

  next(): void {
    if (this.last) return this.close();
    this.step++;
    this.changed();
  }

  prev(): void {
    if (this.step === 0) return;
    this.step--;
    this.changed();
  }

  toggleDontShow(): void {
    this.dontShow = !this.dontShow;
    this.persist();
    this.changed();
  }

  /** Un gesto detectado mientras el tutorial está abierto: se marca como probado si es el del paso actual. */
  gesture(g: Gesture): void {
    const want = this.current.tryGesture;
    if (!want) return;
    const ok = want === g || (want === 'swipe-forward' && g === 'swipe-backward') || (want === 'swipe-left' && g === 'swipe-right');
    if (!ok || this.done.has(this.step)) return;
    this.done.add(this.step);
    this.changed();
  }

  private changed(): void {
    this.version++;
    this.onChange();
  }
}

export const tutorial = new Tutorial();
