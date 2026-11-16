import { type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';

/**
 * Hanging indent for wrapped lines: a line that wraps continues at the line's own indentation
 * instead of jumping back to column 0. The width is passed as `--wrap-indent` (in characters) and
 * applied by the `.cm-wrap-indent` rule in layout.css.
 */
function build(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      if (line.from > last) {
        last = line.from;
        const indent = line.text.length - line.text.trimStart().length;
        if (indent > 0) {
          builder.add(
            line.from,
            line.from,
            Decoration.line({
              class: 'cm-wrap-indent',
              attributes: { style: `--wrap-indent: ${indent}` },
            }),
          );
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

export function wrapIndent(): Extension {
  return plugin;
}
