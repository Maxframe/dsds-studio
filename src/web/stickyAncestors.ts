import { type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { ancestorLines } from '@shared/yaml-ancestors';

const MAX_STICKY = 5;

/**
 * "Sticky scroll" like VS Code: while scrolling, the lines that enclose the first visible line
 * (by indentation) stay pinned at the top, each with its line number. Clicking one jumps to it.
 */
const plugin = ViewPlugin.fromClass(
  class {
    private readonly box: HTMLDivElement;
    private shown = '';
    private readonly onScroll = () => this.render();

    constructor(private readonly view: EditorView) {
      this.box = document.createElement('div');
      this.box.className = 'cm-sticky';
      this.box.setAttribute('aria-hidden', 'true');
      this.box.addEventListener('mousedown', (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-line]');
        if (!row) return;
        e.preventDefault();
        const line = view.state.doc.line(Number(row.dataset.line));
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
        });
        view.focus();
      });
      view.dom.appendChild(this.box);
      view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
      this.render();
    }

    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.geometryChanged) this.render();
    }

    destroy() {
      this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
      this.box.remove();
    }

    private render() {
      this.view.requestMeasure({
        key: this,
        read: (view) => {
          const doc = view.state.doc;
          const lineHeight = view.defaultLineHeight;
          const top = view.scrollDOM.scrollTop;
          const lines = doc.toString().split('\n');
          // The overlay covers the lines below it, so what counts as "first visible" depends on
          // how many ancestors we show: settle on a count (a few rounds, then cap).
          let found: number[] = [];
          for (let round = 0; round < MAX_STICKY; round++) {
            const block = view.lineBlockAtHeight(top + found.length * lineHeight);
            const lineNo = doc.lineAt(block.from).number;
            const next = top <= 0 ? [] : ancestorLines(lines, lineNo, MAX_STICKY);
            if (next.length === found.length) break;
            found = next;
          }
          const gutter = view.dom.querySelector<HTMLElement>('.cm-gutters');
          return { found, gutter: gutter?.offsetWidth ?? 0 };
        },
        write: ({ found, gutter }, view) => {
          const doc = view.state.doc;
          const key = `${gutter}|${found.map((n) => `${n}:${doc.line(n).text}`).join('\n')}`;
          if (key === this.shown) return;
          this.shown = key;
          this.box.replaceChildren(
            ...found.map((n) => {
              const row = document.createElement('div');
              row.className = 'cm-sticky-line';
              row.dataset.line = String(n);
              const num = document.createElement('span');
              num.className = 'cm-sticky-num';
              num.textContent = String(n);
              const text = document.createElement('span');
              text.className = 'cm-sticky-text';
              text.textContent = doc.line(n).text;
              row.append(num, text);
              return row;
            }),
          );
          this.box.style.display = found.length ? '' : 'none';
          this.box.style.setProperty('--sticky-gutter', `${gutter}px`);
        },
      });
    }
  },
);

export function stickyAncestors(): Extension {
  return plugin;
}
