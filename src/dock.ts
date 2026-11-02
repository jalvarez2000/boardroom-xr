/**
 * CSS `matrix3d` que lleva un rectángulo w×h (origen arriba-izquierda) al cuadrilátero `q`
 * (x0,y0 … x3,y3 en píxeles de pantalla: sup-izq, sup-der, inf-der, inf-izq).
 * Es la homografía unidad→cuadrilátero de Heckbert, reescalada a píxeles del elemento.
 */
export function dockMatrix(q: number[], w: number, h: number): string | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q as [number, number, number, number, number, number, number, number];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9 || w <= 0 || h <= 0) return null;
  const a13 = (dx3 * dy2 - dx2 * dy3) / den;
  const a23 = (dx1 * dy3 - dx3 * dy1) / den;
  const a11 = x1 - x0 + a13 * x1;
  const a21 = x3 - x0 + a23 * x3;
  const a12 = y1 - y0 + a13 * y1;
  const a22 = y3 - y0 + a23 * y3;
  const v = [a11 / w, a12 / w, 0, a13 / w, a21 / h, a22 / h, 0, a23 / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${v.join(',')})`;
}
