import { bridge } from './bridge.js';
import { board } from './whiteboard.js';
import { notes } from './notes.js';
import { type Gesture, tutorial } from './tutorial.js';

/** Los microgestos llegan como botones del gamepad de la mano: 5 izq, 6 dcha, 7 adelante, 8 atrás, 9 toque. */
const BUTTONS: [number, Gesture][] = [
  [5, 'swipe-left'],
  [6, 'swipe-right'],
  [7, 'swipe-forward'],
  [8, 'swipe-backward'],
  [9, 'tap'],
];

export interface HandPads {
  isPrimary(kind: 'hand' | 'controller', hand: 'left' | 'right'): boolean;
  gamepads: Record<'left' | 'right', { getButtonDownByIdx(i: number): boolean } | undefined>;
}

/**
 * Microgestos del pulgar sobre el lateral del índice (se leen con la mano baja, sin apuntar):
 * adelante/atrás = zoom, izquierda/derecha = página (o mover la vista con zoom), toque = micrófono.
 * Mientras el tutorial está abierto solo se reconocen para practicarlos.
 */
export function readBoardGestures(xr: HandPads): void {
  for (const hand of ['left', 'right'] as const) {
    // con mandos, esos índices son otros botones: solo se leen si la mano es la entrada activa
    if (!xr.isPrimary('hand', hand)) continue;
    const pad = xr.gamepads[hand];
    if (!pad) continue;
    for (const [idx, g] of BUTTONS) {
      if (pad.getButtonDownByIdx(idx)) apply(g);
    }
  }
}

function apply(g: Gesture): void {
  if (tutorial.visible) return tutorial.gesture(g);
  // con el cuaderno en las manos, deslizar a los lados pasa sus páginas
  if (notes.reading && (g === 'swipe-left' || g === 'swipe-right')) return notes.step(g === 'swipe-left' ? 1 : -1);
  switch (g) {
    case 'tap':
      return bridge.onMic();
    case 'swipe-forward':
      return board.zoomBy(1);
    case 'swipe-backward':
      return board.zoomBy(-1);
    case 'swipe-left':
      return board.zoom > 1 ? board.pan(1) : board.step(1);
    case 'swipe-right':
      return board.zoom > 1 ? board.pan(-1) : board.step(-1);
  }
}
