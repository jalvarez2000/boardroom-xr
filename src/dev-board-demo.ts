import { board } from './whiteboard.js';
import { tutorial } from './tutorial.js';
import { agentEditor } from './agent-editor.js';
import { bridge, setAgents } from './bridge.js';

/** Solo en desarrollo: la «6» enseña la tablet XR con documentos, la «8» abre el tutorial de gestos y la «9» presenta una gráfica y una lista de ejemplo, para probar la pizarra sin backend. */
export function installBoardDemo(): void {
  let n = 0;
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === '8') return tutorial.open();
    if (e.key === '4') {
      // tres directores de ejemplo (el primero es hombre aunque el primer asiento sea de mujer: prueba el cambio de avatar)
      bridge.connected = true;
      const demo = [
        { id: 'd1', name: 'Oliver Hayes', title: 'CTO — Chief Technology Officer', voice: 'male-1' },
        { id: 'd2', name: 'Emma Carter', title: 'CFO — Chief Financial Officer', voice: 'female-1' },
        { id: 'd3', name: 'Mia Brooks', title: 'CMO — Chief Marketing Officer', voice: 'female-2' },
      ];
      setAgents(demo);
      // sin backend: el editor se abre igual (y guardar falla, que es lo esperado en esta demo)
      bridge.onEditAgent = (id) => {
        const a = demo.find((x) => x.id === id);
        if (a) agentEditor.openFor(a.id, a.name, a.voice.startsWith('female'));
      };
      return;
    }
    if (e.key === '5') {
      // activa el panel de diagnóstico de las gafas y recarga (en producción: abrir con ?diag)
      if (localStorage.getItem('boardroom.diag') === '1') localStorage.removeItem('boardroom.diag');
      else localStorage.setItem('boardroom.diag', '1');
      return location.reload();
    }
    if (e.key === '6') {
      // tablet XR con la lista de documentos de ejemplo (sin backend)
      bridge.view = {
        page: 'docs',
        title: 'Kick off',
        meetings: [],
        log: '',
        voice: true,
        docCount: 5,
        listening: true,
        docPage: 0,
        docPages: 2,
        docs: [
          { id: 'a', name: 'Strategic Plan 2027.pdf', global: true },
          { id: 'b', name: 'Asia Contract.pdf', global: false },
          { id: 'c', name: 'Sales Q3.csv', global: true },
        ],
      };
      bridge.viewVersion++;
      return;
    }
    if (e.key !== '9') return;
    n++;
    board.add({
      id: `demo-chart-${n}`,
      agentId: 'demo',
      by: 'Irene Vidal (CTO)',
      title: 'Sales by quarter',
      kind: 'chart',
      chartType: 'bar',
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [{ name: 'Coca-Cola', values: [31, 38, 42, 47] }],
      unit: 'M€',
    });
    board.add({
      id: `demo-slides-${n}`,
      agentId: 'demo',
      by: 'Irene Vidal (CTO)',
      title: 'Priorities',
      kind: 'slides',
      slides: [{ title: 'Priorities 2027', bullets: ['Close the Asia contract', 'Cut logistics costs', 'Launch the sugar-free line'] }],
    });
    board.pageNo = board.pages.findIndex((p) => p.item.id === `demo-chart-${n}`);
    board.step(0);
  });
}

