import { api, type WhiteboardItem } from './api.js';

const safe = (t: string) => t.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'whiteboard';

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const text = (body: string, type = 'text/plain') => new Blob([body], { type: `${type};charset=utf-8` });

/** Descarga lo que se está presentando: el original, o un fichero equivalente (CSV, PPTX, texto). */
export async function downloadItem(it: WhiteboardItem): Promise<void> {
  const base = safe(it.title);
  switch (it.kind) {
    case 'document':
      save(await api.downloadDocument(it.documentId), it.name);
      return;
    case 'chart': {
      const rows = [['', ...it.series.map((s) => s.name)], ...it.labels.map((l, i) => [l, ...it.series.map((s) => String(s.values[i] ?? ''))])];
      const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
      save(text(csv, 'text/csv'), `${base}.csv`);
      return;
    }
    case 'web':
      save(text(`${it.title}\n${it.url}\n\n${it.summary}\n\nSource shown by ${it.by}\n`), `${base}.txt`);
      return;
    case 'notes':
      save(text(`# ${it.title}\n\n${it.body}\n`, 'text/markdown'), `${base}.md`);
      return;
    case 'slides': {
      const { default: PptxGenJS } = await import('pptxgenjs');
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      pptx.title = it.title;
      for (const s of it.slides) {
        const slide = pptx.addSlide();
        slide.background = { color: '0F1B33' };
        slide.addText(s.title, { x: 0.6, y: 0.4, w: 12, h: 1, fontSize: 32, bold: true, color: 'FFFFFF' });
        slide.addText(
          s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          { x: 0.8, y: 1.6, w: 11.6, h: 5, fontSize: 22, color: 'E6EEFC', valign: 'top' },
        );
        if (s.notes) slide.addNotes(s.notes);
      }
      save((await pptx.write({ outputType: 'blob' })) as Blob, `${base}.pptx`);
    }
  }
}
