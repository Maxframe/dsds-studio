import { useCallback, useEffect, useMemo, useState } from 'react';
import { SchemaBundle, effective, nodeOf, propertyOf, type SchemaNode } from '@shared/schema';
import { getAtPointer } from '@shared/pointer';
import type {
  EditOp,
  EntrySummary,
  FileState,
  Finding,
  ProjectOverview,
  RefTarget,
} from '@shared/types';
import { api } from './api';
import { ConfirmButton } from './ConfirmButton';
import { EntryTree, removeHint, sameSelection, type Selection } from './EntryTree';
import { ValidationPanel } from './ValidationPanel';
import { Resizer } from './Resizer';
import { YamlPanel } from './YamlPanel';
import { useYamlAutosave } from './useYamlAutosave';
import { FormProvider, type FormContext } from './form/context';
import { SchemaField } from './form/SchemaField';

/** The field both views are looking at. `source` is the view it came from. */
interface Focus {
  pointer: string;
  source: 'form' | 'yaml' | 'jump';
}

/** Scroll the form to a field; if the exact one isn't drawn, to the nearest drawn ancestor. */
function scrollFormTo(pointer: string) {
  const els = [...document.querySelectorAll<HTMLElement>('[data-pointer]')];
  for (let p = pointer; ; p = p.slice(0, p.lastIndexOf('/'))) {
    const el = els.find((e) => e.dataset.pointer === p);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (p === '') return;
  }
}

const WIDTHS_KEY = 'dsds-studio.pane-widths';
type Widths = { sidebar?: number; panel?: number };

function loadWidths(): Widths {
  try {
    const w = JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}') as Widths;
    return {
      sidebar: typeof w.sidebar === 'number' ? w.sidebar : undefined,
      panel: typeof w.panel === 'number' ? w.panel : undefined,
    };
  } catch {
    return {};
  }
}

export function ProjectView({ slug, onBack }: { slug: string; onBack(): void }) {
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [bundle, setBundle] = useState<SchemaBundle | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [file, setFile] = useState<{ path: string; state: FileState } | null>(null);
  const [targets, setTargets] = useState<RefTarget[]>([]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [widths, setWidths] = useState<Widths>(loadWidths);
  const resize = (key: keyof Widths) => (px: number) =>
    setWidths((cur) => {
      const next = { ...cur, [key]: Math.round(px) };
      try {
        localStorage.setItem(WIDTHS_KEY, JSON.stringify(next));
      } catch {
        /* per-viewer convenience only */
      }
      return next;
    });
  const refresh = useCallback(
    () =>
      api.project(slug).then((o) => {
        setOverview(o);
        api
          .targets(slug)
          .then(setTargets)
          .catch(() => setTargets([]));
      }),
    [slug],
  );

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message));
  }, [refresh]);

  const packVersion = overview?.pack?.version;
  useEffect(() => {
    if (!packVersion) return;
    api
      .schema(packVersion)
      .then((s) => setBundle(new SchemaBundle(s)))
      .catch((e: Error) => setError(e.message));
  }, [packVersion]);

  // Until the user picks something, show the first entry.
  const first = overview?.entries[0];
  const selection: Selection | null =
    selected ??
    (first
      ? { type: 'entry', file: first.file, pointer: first.pointer, origin: first.origin }
      : null);
  const selFile = selection?.file;

  useEffect(() => {
    if (!selFile) return;
    api
      .file(slug, selFile)
      .then((state) => setFile({ path: selFile, state }))
      .catch((e: Error) => setError(e.message));
  }, [slug, selFile]);

  const open = file && file.path === selFile ? file : null;

  const yaml = useYamlAutosave(slug, async (path, state) => {
    setFile((cur) => (cur && cur.path === path ? { path, state } : cur));
    await refresh();
  });
  const flushYaml = yaml.flush;
  const markYamlSaved = yaml.markSaved;

  const applyTo = useCallback(
    async (path: string, ops: EditOp[]) => {
      await flushYaml();
      const state = await api.applyOps(slug, path, ops);
      setFile((cur) => (cur && cur.path === path ? { path, state } : cur));
      markYamlSaved();
      await refresh();
    },
    [slug, refresh, flushYaml, markYamlSaved],
  );

  // Schema nodes: the base document, and the item schemas of its `entries` and `shared`.
  const nodes = useMemo(() => {
    if (!bundle) return null;
    const docNode: SchemaNode = nodeOf(bundle.documentFragment());
    const docEff = effective(bundle, docNode, {});
    return {
      docNode,
      entryItems: propertyOf(bundle, docEff, 'entries', {})?.items ?? null,
      sharedItems: propertyOf(bundle, docEff, 'shared', {})?.items ?? null,
    };
  }, [bundle]);

  const validation =
    open?.state.validation ?? (selFile ? overview?.validation[selFile] : undefined);
  // The form highlights what the YAML cursor (or a clicked finding) points at, not its own focus.
  const formFocus = focus && focus.source !== 'form' ? focus.pointer : null;
  const yamlFocus = focus && focus.source !== 'yaml' ? focus.pointer : null;

  const ctx: FormContext | null = useMemo(
    () =>
      bundle && open
        ? {
            bundle,
            apply: (ops) => applyTo(open.path, ops),
            findings: validation?.findings ?? [],
            targets,
            focus: formFocus,
          }
        : null,
    [bundle, open, applyTo, validation, targets, formFocus],
  );

  // Bring the form to a field the other view pointed at.
  useEffect(() => {
    if (focus && focus.source !== 'form') scrollFormTo(focus.pointer);
  }, [focus, open]);

  /** The entry whose part of the file contains `pointer` (the deepest one), if any. */
  const ownerOf = useCallback(
    (pointer: string): EntrySummary | undefined =>
      overview?.entries
        .filter(
          (e) =>
            e.file === selFile &&
            pointer !== '' &&
            e.pointer !== '' &&
            (pointer === e.pointer || pointer.startsWith(`${e.pointer}/`)),
        )
        .sort((a, b) => b.pointer.length - a.pointer.length)[0] ??
      overview?.entries.find((e) => e.file === selFile && e.pointer === ''),
    [overview, selFile],
  );

  const select = (s: Selection) => {
    void flushYaml();
    setSelected(s);
    setFocus(null);
  };

  const jump = (f: Finding) => {
    if (!selFile) return;
    const owner = ownerOf(f.pointer);
    setSelected(
      owner
        ? { type: 'entry', file: owner.file, pointer: owner.pointer, origin: owner.origin }
        : { type: 'document', file: selFile },
    );
    setFocus({ pointer: f.pointer, source: 'jump' });
  };

  const value = open?.state.value;
  const isBaseFile = typeof value === 'object' && value !== null && 'schemaVersion' in value;

  // The YAML cursor moved: follow it in the form, switching entry when it crosses into another.
  const onYamlCursor = (pointer: string) => {
    setFocus({ pointer, source: 'yaml' });
    if (!selFile) return;
    const owner = ownerOf(pointer);
    const target: Selection | null = owner
      ? { type: 'entry', file: owner.file, pointer: owner.pointer, origin: owner.origin }
      : isBaseFile
        ? { type: 'document', file: selFile }
        : null;
    if (target && !sameSelection(selection, target)) setSelected(target);
  };

  const onYamlEdit = (text: string) => {
    if (selFile) yaml.schedule(selFile, text);
  };

  const removeEntry = async (e: Pick<EntrySummary, 'file' | 'pointer' | 'origin'>) => {
    setNotice(null);
    try {
      await flushYaml();
      if (e.origin === 'standalone') {
        await api.deleteFile(slug, e.file);
        setFile(null);
      } else {
        await applyTo(e.file, [{ op: 'remove', pointer: e.pointer }]);
      }
      setSelected(null);
      setFocus(null);
      await refresh();
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  if (error) {
    return (
      <div className="picker">
        <p className="field-note field-note--error">{error}</p>
        <button type="button" className="button" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }
  if (!overview) return <p className="muted pane">Loading…</p>;

  let editor: React.ReactNode = <p className="muted">Select an entry.</p>;
  if (!overview.pack) {
    editor = (
      <p className="field-note field-note--error">
        No schema pack covers schemaVersion {overview.schemaVersion ?? '(none)'}. Add one with{' '}
        <code>npm run pack:add</code>.
      </p>
    );
  } else if (ctx && nodes && selection && open) {
    const entryNode =
      selection.type === 'entry' && selection.origin === 'shared'
        ? nodes.sharedItems
        : nodes.entryItems;
    const showDocument = selection.type === 'document' && isBaseFile;
    const pointer = selection.type === 'entry' ? selection.pointer : '';
    const node = showDocument ? nodes.docNode : entryNode;
    const current = showDocument ? value : getAtPointer(value, pointer);
    const title =
      (typeof (current as { name?: unknown })?.name === 'string' &&
        (current as { name: string }).name) ||
      selection.file;
    const summary = overview.entries.find(
      (e) =>
        selection.type === 'entry' && e.file === selection.file && e.pointer === selection.pointer,
    );
    editor = (
      <FormProvider value={ctx}>
        <div className="editor-head">
          <h1>{title}</h1>
          {summary ? (
            <ConfirmButton
              label="Remove entry"
              confirmLabel="Remove"
              hint={removeHint(summary)}
              onConfirm={() => void removeEntry(summary)}
            />
          ) : null}
        </div>
        {notice ? <p className="field-note field-note--error">{notice}</p> : null}
        {node ? (
          <div
            // Which field has the browser focus? Tell the YAML view so it can highlight it.
            onFocus={(e) => {
              const el = (e.target as HTMLElement).closest<HTMLElement>('[data-pointer]');
              if (el?.dataset.pointer) {
                setFocus({ pointer: el.dataset.pointer.replace(/#item$/, ''), source: 'form' });
              }
            }}
          >
            <SchemaField
              node={node}
              value={current}
              pointer={pointer}
              hide={showDocument ? ['entries', 'shared'] : undefined}
            />
          </div>
        ) : null}
      </FormProvider>
    );
  }

  return (
    <div
      className="project-shell"
      style={
        {
          ...(widths.sidebar ? { '--layout-sidebar-width': `${widths.sidebar}px` } : {}),
          ...(widths.panel ? { '--layout-panel-width': `${widths.panel}px` } : {}),
        } as React.CSSProperties
      }
    >
      <aside className="pane pane--sidebar">
        <div className="row">
          <button type="button" className="button" onClick={onBack}>
            ← Projects
          </button>
          <strong>{slug}</strong>
        </div>
        <p className="muted">
          Schema {overview.schemaVersion ?? '?'}
          {overview.pack && !overview.pack.exact ? ` (using pack ${overview.pack.version})` : ''}
        </p>
        <EntryTree
          overview={overview}
          selection={selection}
          onSelect={select}
          bundle={bundle}
          entryItems={nodes?.entryItems ?? null}
          apply={applyTo}
          onRemove={(e) => void removeEntry(e)}
        />
      </aside>
      <Resizer side="left" label="Resize sidebar" onResize={resize('sidebar')} />
      <main className="pane">{editor}</main>
      <Resizer side="right" label="Resize YAML panel" onResize={resize('panel')} />
      <aside className="pane--right">
        {open ? (
          <YamlPanel
            key={open.path}
            text={open.state.text}
            highlightPointer={yamlFocus}
            targets={targets}
            onEdit={onYamlEdit}
            onCursorPointer={onYamlCursor}
            onBlur={() => void flushYaml()}
            status={yaml.status}
          />
        ) : (
          <div className="yaml-panel" />
        )}
        <div className="validation-panel">
          <ValidationPanel result={validation} onJump={jump} />
        </div>
      </aside>
    </div>
  );
}
