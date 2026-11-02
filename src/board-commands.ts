import { board } from './whiteboard.js';

const fold = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface Command {
  re: RegExp;
  say: string;
  run: () => void;
}

const COMMANDS: Command[] = [
  { re: /^(zoom in|zoom|enlarge|magnify|closer|bigger|more zoom)( this| that| here)?$/, say: 'Zoom +', run: () => board.zoomBy(1) },
  { re: /^(zoom out|shrink|smaller|farther|further away|less zoom)( this| that)?$/, say: 'Zoom -', run: () => board.zoomBy(-1) },
  { re: /^(full view|full page|whole page|reset view|reset|normal|fit)( view| page)?$/, say: 'Full view', run: () => board.fit() },
  { re: /^(next|next page|next slide|forward|continue|go on)$/, say: 'Next', run: () => board.step(1) },
  { re: /^(previous|previous page|previous slide|back|go back|last page)$/, say: 'Previous', run: () => board.step(-1) },
  { re: /^(close|hide|dismiss) (the )?(whiteboard|board|presentation)$/, say: 'Whiteboard closed', run: () => board.toggleNear(false) },
  { re: /^(open|show|bring up|bring closer) (the )?(whiteboard|board|presentation)$/, say: 'Whiteboard near', run: () => board.toggleNear(true) },
  { re: /^(put|move|send|show) (it|this|that) (on|to|in) (the )?tablet$/, say: 'On the tablet', run: () => board.toggleTablet() },
  { re: /^(download|download this|download that|download it|download the document)$/, say: 'Downloading', run: () => void board.download() },
  { re: /^(stop pointing|clear the mark|clear mark|remove the mark|remove highlight|clear highlight|let go|release)$/, say: 'Mark cleared', run: () => board.unpin() },
];

/**
 * Órdenes de voz para la pizarra: solo valen frases cortas que son la orden entera, para no secuestrar
 * una pregunta a los directores («zoom in on the Asia market» sigue yendo al comité).
 * Devuelve el aviso a mostrar si la frase era una orden (ya ejecutada), o null.
 */
export function boardCommand(text: string): string | null {
  if (board.pages.length === 0) return null;
  const t = fold(text);
  if (t.split(' ').length > 5) return null;
  const c = COMMANDS.find((x) => x.re.test(t));
  if (!c) return null;
  c.run();
  return c.say;
}
