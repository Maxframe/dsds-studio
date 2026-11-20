import { useState } from 'react';
import { ChevronRight, FileText, Plus } from 'lucide-react';
import { cn } from '@web/lib/utils';
import { Button } from '@web/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/components/ui/collapsible';
import { EntryMenu } from './EntryMenu';
import { IdNodes } from './IdGroup';
import { TreeSearch } from './TreeSearch';
import { IconButton } from './IconButton';
import { buildIdTree, matchesQuery, pathTo } from '@shared/idTree';
import { kindLabels } from '@shared/namespaced';
import { insertOps, listRanker } from '@shared/order';
import { AddEntryPanel, NewEntryInput } from './NewEntry';
import type { SchemaBundle, SchemaNode } from '@shared/schema';
import { defaultValueFor, effective, kindOptions, propertyOf } from '@shared/schema';
import type { EditOp, EntrySummary, ProjectOverview, ValidationResult } from '@shared/types';

export type Selection =
  | { type: 'document'; file: string }
  | { type: 'entry'; file: string; pointer: string; origin: EntrySummary['origin'] };

export const sameSelection = (a: Selection | null, b: Selection | null) =>
  !!a &&
  !!b &&
  a.type === b.type &&
  a.file === b.file &&
  (a.type === 'document' || (b.type === 'entry' && a.pointer === b.pointer));

/** Count findings that belong to an entry (their pointer sits under the entry's). */
function counts(result: ValidationResult | undefined, pointer: string) {
  let errors = 0;
  let warnings = 0;
  for (const f of result?.findings ?? []) {
    if (pointer === '' || f.pointer === pointer || f.pointer.startsWith(`${pointer}/`)) {
      if (f.severity === 'error') errors++;
      else warnings++;
    }
  }
  return { errors, warnings };
}

export const removeHint = (e: EntrySummary) =>
  e.origin === 'standalone'
    ? `Moves ${e.file} to .dsds-trash`
    : 'Removes this entry from the document';

/** Group entries by their `kind` (read from the data), system first, shared last. */
function groupEntries(entries: EntrySummary[]): Array<[string, EntrySummary[]]> {
  const groups = new Map<string, EntrySummary[]>();
  for (const e of entries) {
    const key = e.origin === 'shared' ? 'shared' : (e.kind ?? 'entry');
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const rank = (k: string) => (k === 'system' ? 0 : k === 'shared' ? 2 : 1);
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

/** The list index at the end of an entry's pointer (`/entries/3` is 3). */
const indexOf = (pointer: string) => Number(pointer.slice(pointer.lastIndexOf('/') + 1));

/** The "+" in a group title row, shown with the row's other actions on hover. */
function AddButton(props: { label: string; open: boolean; onClick(): void }) {
  return (
    <IconButton
      variant="ghost"
      size="icon-xs"
      // The row behind it already has the accent background, so hover needs a step beyond it.
      className="hover:bg-foreground/10 data-[state=open]:bg-foreground/10"
      aria-expanded={props.open}
      label={props.label}
      onClick={props.onClick}
    >
      <Plus />
    </IconButton>
  );
}

/** The button of a tree row: ghost, and it truncates its label so nothing wraps or grows the sidebar. */
function TreeButton(props: {
  active: boolean;
  expanded?: boolean;
  title?: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      className={cn(
        // The row draws the hover and selected background, so the button itself stays flat.
        'tree-button w-full min-w-0 shrink justify-between gap-1 px-2 font-normal hover:bg-transparent',
      )}
      aria-current={props.active ? 'true' : undefined}
      aria-expanded={props.expanded}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

export function EntryTree(props: {
  overview: ProjectOverview;
  selection: Selection | null;
  onSelect(s: Selection): void;
  bundle: SchemaBundle | null;
  /** The schema node for items of a base document's `entries`, to offer kinds and defaults. */
  entryItems: SchemaNode | null;
  /** The schema node for items of the base document's `shared` list. */
  sharedItems: SchemaNode | null;
  /** The namespace a new custom kind gets, so nobody has to type it. */
  namespace: string;
  apply(file: string, ops: EditOp[]): Promise<void>;
  onRemove(entry: EntrySummary): void;
  onDuplicate(entry: EntrySummary): void;
}) {
  const { overview, selection, onSelect, bundle, entryItems, sharedItems } = props;
  const baseFile = overview.documents[0]?.path;
  // A standalone entry file is listed under its kind below, so it is not repeated as a document.
  const entryFiles = new Set(
    overview.entries.filter((e) => e.origin === 'standalone').map((e) => e.file),
  );
  const documents = overview.documents.filter((d) => !entryFiles.has(d.path));
  // Which "add" is open: a group's inline name field, or the general panel for any kind.
  const [adding, setAdding] = useState<string | 'panel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kinds = bundle && entryItems ? kindOptions(bundle, entryItems) : [];
  // The schema's pattern for a custom kind, so what is typed can be made valid.
  const kindPattern =
    bundle && entryItems
      ? propertyOf(bundle, effective(bundle, entryItems, {}), 'kind', undefined)?.namespacePattern
      : undefined;
  const canAdd = !!bundle && !!baseFile && !!entryItems;
  const kindsInUse = new Map<string, number>();
  for (const e of overview.entries) {
    if (e.origin === 'shared' || !e.kind) continue;
    kindsInUse.set(e.kind, (kindsInUse.get(e.kind) ?? 0) + 1);
  }

  /**
   * Add `value` to the base document's `entries` or `shared` list, then open it. An entry goes where
   * the style guide puts its kind (after what it is built on); a shared entry goes last.
   */
  const appendToBase = async (shared: boolean, value: object) => {
    if (!baseFile || !bundle) return;
    const list = shared ? '/shared' : '/entries';
    const origin = shared ? 'shared' : 'entries';
    const existing = overview.entries
      .filter((e) => e.file === baseFile && e.origin === origin)
      .sort((a, b) => indexOf(a.pointer) - indexOf(b.pointer))
      .map((e) => ({ kind: e.kind ?? undefined }));
    const rank = !shared && entryItems ? listRanker(bundle, 'entries', entryItems) : null;
    const { ops, index } = insertOps(list, existing, value, rank);
    try {
      setError(null);
      await props.apply(baseFile, ops);
      setAdding(null);
      onSelect({ type: 'entry', file: baseFile, pointer: `${list}/${index}`, origin });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** Add an entry of `kind` (or a shared one) to the base document, then open it. */
  const create = async (kind: string | 'shared', name: string) => {
    const shared = kind === 'shared';
    const node = shared ? sharedItems : entryItems;
    if (!bundle || !node || !baseFile) return;
    const taken = new Set(overview.entries.map((e) => e.id));
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'entry';
    let id = slug;
    for (let n = 2; taken.has(id); n++) id = `${slug}-${n}`;
    await appendToBase(shared, {
      ...(defaultValueFor(bundle, node, shared ? {} : { kind }) as object),
      id,
      name,
    });
  };

  const startAdding = (what: string | 'panel') => {
    setError(null);
    setAdding(adding === what ? null : what);
  };

  // A custom kind is shown by its own name, without the namespace the schema requires.
  const labels = kindLabels(groupEntries(overview.entries).map(([g]) => g));
  const labelOf = (group: string) => labels.get(group) ?? group;

  // The filter narrows the entries; while it is set every group is open so the matches show.
  const [query, setQuery] = useState('');
  const filtering = query.trim() !== '';
  const shown = filtering
    ? overview.entries.filter((e) => matchesQuery(e, query))
    : overview.entries;
  const groups = groupEntries(shown).map(
    ([kind, entries]) => [kind, entries, buildIdTree(entries, (e) => e.id)] as const,
  );

  // Id groups start closed; a kind group starts open. What the user toggled is kept here.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [closedKinds, setClosedKinds] = useState<ReadonlySet<string>>(new Set());
  const toggle = (set: ReadonlySet<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };

  // Selecting an entry (from a link, a search or the code panel) opens the groups that hold it.
  const selectedKey = selection?.type === 'entry' ? `${selection.file}${selection.pointer}` : null;
  // Adjusted while rendering, once per selection, so a group the user closes afterwards stays closed.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (selectedKey !== openedFor) {
    setOpenedFor(selectedKey);
    const entry = selectedKey
      ? overview.entries.find((e) => `${e.file}${e.pointer}` === selectedKey)
      : undefined;
    if (entry) {
      const kindOf = (e: EntrySummary) => (e.origin === 'shared' ? 'shared' : (e.kind ?? 'entry'));
      const same = overview.entries.filter((e) => kindOf(e) === kindOf(entry));
      const path = pathTo(
        buildIdTree(same, (e) => e.id),
        (e) => e === entry,
      );
      if (path?.length) setOpenIds(new Set([...openIds, ...path]));
      if (closedKinds.has(kindOf(entry))) setClosedKinds(toggle(closedKinds, kindOf(entry), false));
    }
  }

  const findingsOf = (entries: EntrySummary[]) =>
    entries.reduce(
      (sum, e) => {
        const c = counts(overview.validation[e.file], e.pointer);
        return { errors: sum.errors + c.errors, warnings: sum.warnings + c.warnings };
      },
      { errors: 0, warnings: 0 },
    );

  const renderEntry = (e: EntrySummary) => {
    const sel: Selection = { type: 'entry', file: e.file, pointer: e.pointer, origin: e.origin };
    const c = counts(overview.validation[e.file], e.pointer);
    return (
      <div
        key={`${e.file}${e.pointer}`}
        className={cn('tree-row', sameSelection(selection, sel) && 'tree-row--active')}
      >
        <TreeButton
          active={sameSelection(selection, sel)}
          title={e.id}
          onClick={() => onSelect(sel)}
        >
          <span className="truncate">{e.name ?? e.id}</span>
          {c.errors ? <span className="badge badge--error">{c.errors}</span> : null}
          {!c.errors && c.warnings ? (
            <span className="badge badge--warning">{c.warnings}</span>
          ) : null}
        </TreeButton>
        <span className="tree-row-actions">
          <EntryMenu
            name={e.name ?? e.id}
            removeHint={removeHint(e)}
            onDuplicate={() => props.onDuplicate(e)}
            onRemove={() => props.onRemove(e)}
          />
        </span>
      </div>
    );
  };

  return (
    <div>
      <TreeSearch value={query} onChange={setQuery} />
      <div className="tree-group tree-rows">
        {canAdd ? (
          <div className={cn('tree-row', adding === 'panel' && 'tree-row--open')}>
            <TreeButton
              active={false}
              expanded={adding === 'panel'}
              onClick={() => startAdding('panel')}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Plus aria-hidden className="size-4 shrink-0" />
                <span className="truncate">New entry</span>
              </span>
            </TreeButton>
          </div>
        ) : null}
        {adding === 'panel' ? (
          <AddEntryPanel
            standard={kinds}
            namespace={props.namespace}
            pattern={kindPattern}
            inUse={kindsInUse}
            onCreate={(kind, name) => void create(kind, name)}
            onCancel={() => setAdding(null)}
            error={error}
          />
        ) : null}
        {(filtering ? [] : documents).map((d, i) => {
          const sel: Selection = { type: 'document', file: d.path };
          const c = counts(overview.validation[d.path], '');
          return (
            <div
              key={d.path}
              className={cn('tree-row', sameSelection(selection, sel) && 'tree-row--active')}
            >
              <TreeButton
                active={sameSelection(selection, sel)}
                title={d.path}
                onClick={() => onSelect(sel)}
              >
                {/* The first document is the base (DSDS: the top-level container); others by file. */}
                <span className="flex min-w-0 items-center gap-2">
                  <FileText aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{i === 0 ? 'Base' : d.path}</span>
                </span>
                {c.errors ? <span className="badge badge--error">{c.errors}</span> : null}
              </TreeButton>
            </div>
          );
        })}
      </div>

      {filtering && groups.length === 0 ? (
        <p className="tree-empty" role="status">
          No entries match “{query.trim()}”.
        </p>
      ) : null}

      {groups.map(([group, , nodes]) => (
        <Collapsible
          key={group}
          open={filtering || !closedKinds.has(group)}
          onOpenChange={(o) => setClosedKinds((prev) => toggle(prev, group, !o))}
          className="tree-group"
          role="group"
          aria-labelledby={`tree-group-${group}`}
        >
          <div className={cn('tree-row tree-heading', adding === group && 'tree-row--open')}>
            <h2 id={`tree-group-${group}`} className="pane-title">
              <CollapsibleTrigger className="group flex min-h-(--control-height) w-full cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1 text-inherit [font:inherit] outline-none hover:bg-transparent focus-visible:ring-3 focus-visible:ring-ring/50">
                <ChevronRight
                  aria-hidden
                  className="size-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                />
                <span className="inline-block first-letter:uppercase">{labelOf(group)}</span>
              </CollapsibleTrigger>
            </h2>
            {canAdd && (group !== 'shared' || sharedItems) ? (
              <span className="tree-row-actions">
                <AddButton
                  label={`Add ${labelOf(group)} entry`}
                  open={adding === group}
                  onClick={() => startAdding(group)}
                />
              </span>
            ) : null}
          </div>
          {adding === group ? (
            <NewEntryInput
              label={`New ${labelOf(group)} name`}
              onCreate={(name) => void create(group, name)}
              onCancel={() => setAdding(null)}
              error={error}
            />
          ) : null}
          <CollapsibleContent>
            <div className="tree-rows">
              <IdNodes
                nodes={nodes}
                open={openIds}
                forceOpen={filtering}
                onToggle={(key, on) => setOpenIds((prev) => toggle(prev, key, on))}
                findings={findingsOf}
                renderEntry={renderEntry}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
