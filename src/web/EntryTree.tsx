import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@web/lib/utils';
import { Button } from '@web/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/components/ui/collapsible';
import { Input } from '@web/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { EntryMenu } from './EntryMenu';
import type { SchemaBundle, SchemaNode } from '@shared/schema';
import { defaultValueFor, kindOptions } from '@shared/schema';
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

/** The button of a tree row: ghost, and it truncates its label so nothing wraps or grows the sidebar. */
function TreeButton(props: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      className={cn(
        // The row draws the hover and selected background, so the button itself stays flat.
        'tree-button w-full min-w-0 shrink justify-between gap-1 px-2 font-normal hover:bg-transparent',
      )}
      aria-current={props.active ? 'true' : undefined}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

/** Radix Select forbids an empty item value, so the generic kind gets a sentinel. */
const GENERIC = '\u0000generic';

export function EntryTree(props: {
  overview: ProjectOverview;
  selection: Selection | null;
  onSelect(s: Selection): void;
  bundle: SchemaBundle | null;
  /** The schema node for items of a base document's `entries`, to offer kinds and defaults. */
  entryItems: SchemaNode | null;
  apply(file: string, ops: EditOp[]): Promise<void>;
  onRemove(entry: EntrySummary): void;
  onDuplicate(entry: EntrySummary): void;
}) {
  const { overview, selection, onSelect, bundle, entryItems } = props;
  const baseFile = overview.documents[0]?.path;
  // A standalone entry file is listed under its kind below, so it is not repeated as a document.
  const entryFiles = new Set(
    overview.entries.filter((e) => e.origin === 'standalone').map((e) => e.file),
  );
  const documents = overview.documents.filter((d) => !entryFiles.has(d.path));
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const kinds = bundle && entryItems ? kindOptions(bundle, entryItems) : [];

  const add = async () => {
    if (!bundle || !entryItems || !baseFile) return;
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const value = {
      ...(defaultValueFor(bundle, entryItems, { kind: kind || 'entry' }) as object),
      id,
      name: name.trim(),
    };
    try {
      setError(null);
      await props.apply(baseFile, [{ op: 'append', pointer: '/entries', value }]);
      setName('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h2 className="pane-title">Files</h2>
      {documents.map((d) => {
        const sel: Selection = { type: 'document', file: d.path };
        const c = counts(overview.validation[d.path], '');
        return (
          <div key={d.path} className="tree-group">
            <div className={cn('tree-row', sameSelection(selection, sel) && 'tree-row--active')}>
              <TreeButton active={sameSelection(selection, sel)} onClick={() => onSelect(sel)}>
                <span className="truncate">{d.path}</span>
                <span className="badge">base</span>
                {c.errors ? <span className="badge badge--error">{c.errors}</span> : null}
              </TreeButton>
            </div>
          </div>
        );
      })}

      {groupEntries(overview.entries).map(([group, entries]) => (
        <Collapsible key={group} defaultOpen className="tree-group">
          <h2 className="pane-title">
            <CollapsibleTrigger className="group inline-flex cursor-pointer items-center gap-1 rounded-sm border-0 bg-transparent p-0 text-inherit [font:inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <ChevronRight
                aria-hidden
                className="size-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
              />
              <span className="inline-block first-letter:uppercase">{group}</span>
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent>
            {entries.map((e) => {
              const sel: Selection = {
                type: 'entry',
                file: e.file,
                pointer: e.pointer,
                origin: e.origin,
              };
              const c = counts(overview.validation[e.file], e.pointer);
              return (
                <div
                  key={`${e.file}${e.pointer}`}
                  className={cn('tree-row', sameSelection(selection, sel) && 'tree-row--active')}
                >
                  <TreeButton active={sameSelection(selection, sel)} onClick={() => onSelect(sel)}>
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
            })}
          </CollapsibleContent>
        </Collapsible>
      ))}

      {baseFile && kinds.length > 0 ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <h2 className="pane-title">Add entry</h2>
          <Select
            value={kind === '' ? GENERIC : kind}
            onValueChange={(k) => setKind(k === GENERIC ? '' : k)}
          >
            <SelectTrigger aria-label="Entry kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENERIC}>entry (generic)</SelectItem>
              {kinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Entry name"
          />
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            Add
          </Button>
          {error ? <div className="field-note field-note--error">{error}</div> : null}
        </form>
      ) : null}
    </div>
  );
}
