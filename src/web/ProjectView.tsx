import { ArrowLeft, PanelRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SchemaBundle, effective, nodeOf, propertyOf, type SchemaNode } from '@shared/schema';
import { fieldUsage } from '@shared/field-usage';
import { fileNameForId } from '@shared/filename';
import { projectNamespace } from '@shared/namespaced';
import { insertOps, listRanker } from '@shared/order';
import { getAtPointer } from '@shared/pointer';
import type {
  EditOp,
  EntrySummary,
  DraftState,
  FileState,
  Finding,
  ProjectOverview,
  RefTarget,
  ResolvedProject,
  VersionInfo,
} from '@shared/types';
import { api } from './api';
import { cn } from '@web/lib/utils';
import { Button } from '@web/components/ui/button';
import { SettingsMenu } from './SettingsMenu';
import { IdChangeDialog, type IdChange } from './IdChangeDialog';
import { UsedBy } from './UsedBy';
import { useSettings } from './settings';
import { ConfirmButton } from './ConfirmButton';
import { IconButton } from './IconButton';
import { DraftBar, type SaveInput } from './DraftBar';
import type { RestoreMode } from './RestoreDialog';
import { EntryTree, removeHint, sameSelection, type Selection } from './EntryTree';
import { ValidationPanel } from './ValidationPanel';
import { Resizer } from './Resizer';
import { YamlPanel } from './YamlPanel';
import { useYamlAutosave } from './useYamlAutosave';
import { FormProvider, type FormContext } from './form/context';
import { SchemaField } from './form/SchemaField';

/** What to do with each answer to "change this id?". */
interface IdChangeActions {
  cancel(): void;
  only(): void;
  update(): Promise<void>;
}

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

const PANEL_KEY = 'dsds-studio.panel-open';

/** The YAML panel is open unless the viewer collapsed it. */
function loadPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== 'false';
  } catch {
    return true;
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
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [reload, setReload] = useState(0);
  const [targets, setTargets] = useState<RefTarget[]>([]);
  const [resolved, setResolved] = useState<ResolvedProject | null>(null);
  // An entry id waiting for a yes: what changes, and what to do with each answer.
  const [idChange, setIdChange] = useState<(IdChange & IdChangeActions) | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, updateSettings] = useSettings();
  const [widths, setWidths] = useState<Widths>(loadWidths);
  const [panelOpen, setPanelOpen] = useState(loadPanelOpen);
  // The toggle sits at the window's right edge in both states: in the YAML panel's toolbar while it
  // is open, in the form's toolbar once it is collapsed. It is a different element then, so focus
  // is moved to it after a click, and the keyboard user stays on the control.
  const refocusToggle = useRef(false);
  useEffect(() => {
    if (!refocusToggle.current) return;
    refocusToggle.current = false;
    document.getElementById('panel-toggle')?.focus();
  }, [panelOpen]);
  const togglePanel = () => {
    refocusToggle.current = true;
    setPanelOpen((open) => {
      try {
        localStorage.setItem(PANEL_KEY, String(!open));
      } catch {
        /* per-viewer convenience only */
      }
      return !open;
    });
  };
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
        // Every save goes through refresh, so the draft stays current without its own polling.
        api
          .draft(slug)
          .then(setDraft)
          .catch(() => setDraft(null));
        api
          .targets(slug)
          .then(setTargets)
          .catch(() => setTargets([]));
        api
          .resolved(slug)
          .then(setResolved)
          .catch(() => setResolved(null));
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
  }, [slug, selFile, reload]);

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

  // New custom kinds get the namespace the project already uses, else its system entry's id.
  const namespace = useMemo(
    () =>
      projectNamespace(
        (overview?.entries ?? []).flatMap((e) => (e.kind ? [e.kind] : [])),
        overview?.entries.find((e) => e.kind === 'system')?.id,
        slug,
      ),
    [overview, slug],
  );

  // What the resolver works out for an item of the open entry that reuses another (§4), by pointer.
  const reusedAt = useCallback(
    (pointer: string) => {
      const entry =
        selection?.type === 'entry'
          ? overview?.entries.find(
              (e) => e.file === selection.file && e.pointer === selection.pointer,
            )
          : undefined;
      if (!entry || !resolved || (entry.pointer && !pointer.startsWith(`${entry.pointer}/`))) {
        return undefined;
      }
      const relative = pointer.slice(entry.pointer.length);
      return resolved.entries[entry.id]?.items.find((i) => i.pointer === relative && i.reuses);
    },
    [selection, overview, resolved],
  );

  /**
   * An entry's id is about to change. If nothing points at it, go ahead. Otherwise ask: what
   * points at it would break (Specification §3.1), and the pointers can be updated with it.
   */
  const requestIdChange = useCallback<FormContext['requestIdChange']>(
    (from, to, done) => {
      const incoming = resolved?.entries[from]?.incoming ?? [];
      if (incoming.length === 0) {
        done.commit();
        return;
      }
      setIdChange({
        from,
        to,
        count: incoming.length,
        cancel: done.cancel,
        only: done.commit,
        update: async () => {
          // Every pointer to the old id, written as a `set` of its `to` in the entry that holds it,
          // keeping an item address (`old#rule` becomes `new#rule`). The id change itself rides in
          // the same request as the changes to the open file, so that file is written once.
          const byFile = new Map<string, EditOp[]>([
            [open?.path ?? '', [{ op: 'set', pointer: done.pointer, value: to }]],
          ]);
          for (const i of incoming) {
            const holder = overview?.entries.find((e) => e.id === i.from.split('#')[0]);
            if (!holder) continue;
            const ops = byFile.get(holder.file) ?? [];
            ops.push({
              op: 'set',
              pointer: `${holder.pointer}${i.pointer.slice(holder.id.length)}/to`,
              value: `${to}${i.at ? `#${i.at}` : ''}`,
            });
            byFile.set(holder.file, ops);
          }
          for (const [file, ops] of byFile) await applyTo(file, ops);
        },
      });
    },
    [resolved, overview, open, applyTo],
  );

  const ctx: FormContext | null = useMemo(
    () =>
      bundle && open
        ? {
            bundle,
            apply: (ops) => applyTo(open.path, ops),
            findings: validation?.findings ?? [],
            targets,
            usage: (pointer) =>
              fieldUsage(open.state.value, pointer, open.path, overview?.entries ?? []),
            namespace,
            valueAt: (pointer) => getAtPointer(open.state.value, pointer),
            reused: (pointer) => reusedAt(pointer),
            requestIdChange,
            focus: formFocus,
          }
        : null,
    [
      bundle,
      open,
      applyTo,
      validation,
      targets,
      overview,
      formFocus,
      namespace,
      reusedAt,
      requestIdChange,
    ],
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

  /** Open the entry that holds a pointer, at that pointer: the "Used by" rows. */
  const goToPointer = (entry: EntrySummary, relative: string) => {
    void flushYaml();
    setSelected({ type: 'entry', file: entry.file, pointer: entry.pointer, origin: entry.origin });
    setFocus({ pointer: `${entry.pointer}${relative}`, source: 'jump' });
  };

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

  /** Save the draft as a version. Pending YAML text is saved first so the version includes it. */
  const saveVersion = async (input: SaveInput) => {
    await flushYaml();
    setDraft(await api.saveVersion(slug, input));
    // A stamp changes the files, so what is on screen is read again from them.
    if (input.stamp) {
      setReload((n) => n + 1);
      await refresh();
    }
  };
  const quicksave = async () => {
    setNotice(null);
    try {
      await saveVersion({ label: '', tag: '', stamp: false });
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  // Ctrl/Cmd+S quicksaves instead of the browser's "save page".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (draft && draft.changed.length > 0) void quicksave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * Restore an earlier version. Unsaved changes are first quicksaved or discarded, as chosen, so
   * the restore itself never overwrites work. Reloads what is on screen from the files afterwards.
   */
  const restoreVersion = async (version: VersionInfo, how: RestoreMode) => {
    await flushYaml();
    if (how === 'quicksave') await saveVersion({ label: '', tag: '', stamp: false });
    if (how === 'discard') await api.discardDraft(slug);
    setDraft(await api.restoreVersion(slug, version.id));
    markYamlSaved();
    setSelected(null);
    setFocus(null);
    setReload((n) => n + 1);
    await refresh();
  };

  /** Go back to the last version: drop the draft, then reload what is on screen from the files. */
  const discardDraft = async () => {
    setNotice(null);
    try {
      await flushYaml();
      await api.discardDraft(slug);
      markYamlSaved();
      setSelected(null);
      setFocus(null);
      setReload((n) => n + 1);
      await refresh();
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  /** Copy an entry next to the original, with a free id and a "(copy)" name, and open the copy. */
  const duplicateEntry = async (e: EntrySummary) => {
    setNotice(null);
    try {
      await flushYaml();
      const state = await api.file(slug, e.file);
      const original = getAtPointer(state.value, e.pointer);
      if (typeof original !== 'object' || original === null) throw new Error('Entry not found');
      const taken = new Set(overview?.entries.map((x) => x.id));
      let id = `${e.id}-copy`;
      for (let n = 2; taken.has(id); n++) id = `${e.id}-copy-${n}`;
      const copy: Record<string, unknown> = { ...(original as Record<string, unknown>), id };
      // A `uuid` is one entry's stable key (Specification §3.1): the copy gets none, not a duplicate.
      delete copy.uuid;
      if (typeof copy.name === 'string') copy.name = `${copy.name} (copy)`;

      if (e.origin === 'standalone') {
        const dir = e.file.includes('/') ? e.file.slice(0, e.file.lastIndexOf('/') + 1) : '';
        const path = `${dir}${fileNameForId(id)}.dsds.yaml`;
        await api.saveText(slug, path, state.text);
        await api.applyOps(slug, path, [
          ...Object.entries(copy)
            .filter(([k]) => k === 'id' || k === 'name')
            .map(([k, value]) => ({ op: 'set' as const, pointer: `/${k}`, value })),
          ...('uuid' in original ? [{ op: 'remove' as const, pointer: '/uuid' }] : []),
        ]);
        await refresh();
        select({ type: 'entry', file: path, pointer: '', origin: 'standalone' });
      } else {
        const list = e.origin === 'shared' ? '/shared' : '/entries';
        const items = getAtPointer(state.value, list) as unknown[];
        // The copy joins the other entries of its kind, as a new entry of that kind would.
        const rank =
          e.origin === 'shared' || !bundle || !nodes?.entryItems
            ? null
            : listRanker(bundle, 'entries', nodes.entryItems);
        const { ops, index } = insertOps(list, items, copy, rank);
        await applyTo(e.file, ops);
        select({ type: 'entry', file: e.file, pointer: `${list}/${index}`, origin: e.origin });
      }
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  const answerIdChange = async (how: 'cancel' | 'only' | 'update') => {
    const pending = idChange;
    setIdChange(null);
    if (!pending) return;
    try {
      if (how === 'cancel') pending.cancel();
      else if (how === 'only') pending.only();
      else await pending.update();
    } catch (err) {
      setNotice((err as Error).message);
      pending.cancel();
    }
  };

  if (error) {
    return (
      <div className="picker">
        <p className="field-note field-note--error">{error}</p>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }
  if (!overview) return <p className="muted pane">Loading…</p>;

  let toolbarMain: React.ReactNode = null;
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
    toolbarMain = (
      <>
        <h1 className="toolbar-heading" title={title}>
          {title}
        </h1>
        {summary ? (
          <ConfirmButton
            label="Remove entry"
            confirmLabel="Remove"
            hint={removeHint(summary)}
            onConfirm={() => void removeEntry(summary)}
          />
        ) : null}
      </>
    );
    editor = (
      <FormProvider value={ctx}>
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
        {summary && resolved?.entries[summary.id]?.incoming ? (
          <UsedBy
            incoming={resolved.entries[summary.id]?.incoming ?? []}
            entries={overview.entries}
            onGo={goToPointer}
          />
        ) : null}
      </FormProvider>
    );
  }

  const panelToggle = (
    <IconButton
      id="panel-toggle"
      variant="ghost"
      size="icon"
      className="ml-auto"
      label={panelOpen ? 'Hide editor panel' : 'Show editor panel'}
      aria-pressed={panelOpen}
      onClick={togglePanel}
    >
      <PanelRight />
    </IconButton>
  );

  return (
    <div
      className={cn('project-shell', !panelOpen && 'project-shell--no-panel')}
      style={
        {
          ...(widths.sidebar ? { '--layout-sidebar-width': `${widths.sidebar}px` } : {}),
          ...(widths.panel ? { '--layout-panel-width': `${widths.panel}px` } : {}),
        } as React.CSSProperties
      }
    >
      <aside className="column column--sidebar">
        <header className="toolbar">
          <IconButton variant="ghost" size="icon" label="Back to projects" onClick={onBack}>
            <ArrowLeft />
          </IconButton>
          <strong className="toolbar-title" title={slug}>
            {slug}
          </strong>
          <SettingsMenu settings={settings} onChange={updateSettings} />
        </header>
        <div className="pane">
          <DraftBar
            slug={slug}
            draft={draft}
            onDiscard={() => void discardDraft()}
            onQuicksave={quicksave}
            onSaveVersion={saveVersion}
            onRestore={restoreVersion}
          />
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
            sharedItems={nodes?.sharedItems ?? null}
            namespace={namespace}
            apply={applyTo}
            onRemove={(e) => void removeEntry(e)}
            onDuplicate={(e) => void duplicateEntry(e)}
          />
        </div>
      </aside>
      <IdChangeDialog
        change={idChange}
        onCancel={() => void answerIdChange('cancel')}
        onOnly={() => void answerIdChange('only')}
        onUpdate={() => void answerIdChange('update')}
      />
      <Resizer side="left" label="Resize sidebar" onResize={resize('sidebar')} />
      <main className="column">
        <header className="toolbar">
          {toolbarMain}
          {panelOpen ? null : panelToggle}
        </header>
        <div className="pane">{editor}</div>
      </main>
      <Resizer side="right" label="Resize YAML panel" onResize={resize('panel')} />
      <aside className="column column--right">
        <header className="toolbar">{panelOpen ? panelToggle : null}</header>
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
