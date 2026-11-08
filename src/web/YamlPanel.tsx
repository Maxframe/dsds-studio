import { useEffect, useRef } from 'react';
import {
  Annotation,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  drawSelection,
  keymap,
  lineNumbers,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { classHighlighter } from '@lezer/highlight';
import { linkAt, suggestTargets } from '@shared/dsds-links';
import type { RefTarget } from '@shared/types';
import { stickyAncestors } from './stickyAncestors';
import { locatePointer, pointerAtOffset } from '@shared/yaml-locate';

/** Marks changes we make ourselves (syncing from the form), so they are not treated as typing. */
const fromOutside = Annotation.define<boolean>();
const setLines = StateEffect.define<{ from: number; to: number } | null>();
const lineMark = Decoration.line({ class: 'cm-field-highlight' });

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setLines)) continue;
      if (!e.value) return Decoration.none;
      const builder = new RangeSetBuilder<Decoration>();
      const last = Math.min(e.value.to, tr.state.doc.lines);
      for (let n = e.value.from; n <= last; n++)
        builder.add(tr.state.doc.line(n).from, tr.state.doc.line(n).from, lineMark);
      return builder.finish();
    }
    return tr.docChanged ? deco.map(tr.changes) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** While the editor has focus, the row the caret is on gets the same highlight as a form-focused field. */
const caretRow = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.selectionSet || u.docChanged || u.focusChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      if (!view.hasFocus) return Decoration.none;
      const line = view.state.doc.lineAt(view.state.selection.main.head);
      return Decoration.set([lineMark.range(line.from)]);
    }
  },
  { decorations: (v) => v.decorations },
);

// Colors come from design tokens, so the editor follows light/dark and any restyle of tokens.css.
const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--color-text)', backgroundColor: 'var(--color-surface)' },
  '.cm-scroller': {
    fontFamily: 'var(--font-code)',
    fontSize: 'var(--text-small)',
    lineHeight: '1.5',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface-sunken)',
    color: 'var(--color-text-muted)',
    border: 'none',
  },
  // CodeMirror's base theme paints the caret black unless it knows the theme is dark, so set it
  // from tokens. drawSelection gives a wider, blinking caret we can color (.cm-cursor).
  '.cm-content': { caretColor: 'var(--color-text)' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--color-text)',
    borderLeftWidth: 'var(--focus-ring-width)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--color-highlight)',
  },
  '.cm-field-highlight': { backgroundColor: 'var(--color-highlight)' },
});

/** Replace the document with `next`, touching only the part that differs (keeps cursor and scroll). */
function replaceDoc(view: EditorView, next: string) {
  const cur = view.state.doc.toString();
  let start = 0;
  const max = Math.min(cur.length, next.length);
  while (start < max && cur[start] === next[start]) start++;
  let endCur = cur.length;
  let endNext = next.length;
  while (endCur > start && endNext > start && cur[endCur - 1] === next[endNext - 1]) {
    endCur--;
    endNext--;
  }
  view.dispatch({
    changes: { from: start, to: endCur, insert: next.slice(start, endNext) },
    annotations: fromOutside.of(true),
  });
}

export function YamlPanel(props: {
  /** The saved text of the open file. */
  text: string;
  /** Pointer to highlight (the field being edited in the form), or null. */
  highlightPointer: string | null;
  /** The user typed. Called with the full new text. */
  onEdit(text: string): void;
  /** The cursor moved to a field, while the editor has focus. */
  onCursorPointer(pointer: string): void;
  onBlur(): void;
  /** Link targets offered after `dsds:`. */
  targets: RefTarget[];
  /** Save state shown under the editor, e.g. "Saved" or an error. */
  status: { kind: 'ok' | 'saving' | 'error'; message: string };
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const dirty = useRef(false);
  const lastPointer = useRef<string | null>(null);
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });

  // Create the editor once.
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: handlers.current.text,
        extensions: [
          lineNumbers(),
          drawSelection(),
          caretRow,
          stickyAncestors(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          yaml(),
          autocompletion({
            override: [
              (ctx: CompletionContext) => {
                const line = ctx.state.doc.lineAt(ctx.pos);
                const link = linkAt(line.text, ctx.pos - line.from);
                if (!link) return null;
                return {
                  from: line.from + link.from,
                  filter: false,
                  options: suggestTargets(handlers.current.targets, link.query).map((t) => ({
                    label: t.target,
                    detail: t.label,
                  })),
                };
              },
            ],
          }),
          syntaxHighlighting(classHighlighter),
          EditorView.lineWrapping,
          highlightField,
          theme,
          EditorView.contentAttributes.of({ 'aria-label': 'Document YAML' }),
          EditorView.updateListener.of((u) => {
            if (u.transactions.some((t) => t.annotation(fromOutside))) return;
            if (u.docChanged) {
              dirty.current = true;
              handlers.current.onEdit(u.state.doc.toString());
            }
            if ((u.selectionSet || u.docChanged) && u.view.hasFocus) {
              const p = pointerAtOffset(u.state.doc.toString(), u.state.selection.main.head);
              if (p !== null) handlers.current.onCursorPointer(p);
            }
          }),
          EditorView.domEventHandlers({ blur: () => handlers.current.onBlur() }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  // The saved text changed (a form edit, a reload): show it, unless the user has unsaved typing.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (v.state.doc.toString() === props.text) dirty.current = false;
    else if (!dirty.current) replaceDoc(v, props.text);
  }, [props.text]);

  // Highlight the field being edited in the other view; scroll to it when it changes.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const range = props.highlightPointer
      ? locatePointer(v.state.doc.toString(), props.highlightPointer)
      : null;
    const changed = lastPointer.current !== props.highlightPointer;
    lastPointer.current = props.highlightPointer;
    v.dispatch({
      effects: [
        setLines.of(range ? { from: range.fromLine, to: range.toLine } : null),
        ...(range && changed
          ? [
              EditorView.scrollIntoView(
                v.state.doc.line(Math.min(range.fromLine, v.state.doc.lines)).from,
                { y: 'center' },
              ),
            ]
          : []),
      ],
      annotations: fromOutside.of(true),
    });
  }, [props.highlightPointer, props.text]);

  return (
    <div className="yaml-panel">
      <div className="yaml-host" ref={host} data-testid="yaml-editor" />
      <div className={`yaml-status yaml-status--${props.status.kind}`} role="status">
        {props.status.message}
      </div>
    </div>
  );
}
