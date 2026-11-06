import { useState } from 'react';
import { ConfirmButton } from './ConfirmButton';
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

export function EntryTree(props: {
  overview: ProjectOverview;
  selection: Selection | null;
  onSelect(s: Selection): void;
  bundle: SchemaBundle | null;
  /** The schema node for items of a base document's `entries`, to offer kinds and defaults. */
  entryItems: SchemaNode | null;
  apply(file: string, ops: EditOp[]): Promise<void>;
  onRemove(entry: EntrySummary): void;
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
      <h2 className="pane-title">Documents</h2>
      {documents.map((d) => {
        const sel: Selection = { type: 'document', file: d.path };
        const c = counts(overview.validation[d.path], '');
        return (
          <div key={d.path} className="tree-group">
            <button
              type="button"
              className={`tree-item ${sameSelection(selection, sel) ? 'tree-item--active' : ''}`}
              onClick={() => onSelect(sel)}
            >
              <span>{d.path}</span>
              {c.errors ? <span className="badge badge--error">{c.errors}</span> : null}
            </button>
          </div>
        );
      })}

      {groupEntries(overview.entries).map(([group, entries]) => (
        <div key={group} className="tree-group">
          <h2 className="pane-title">{group}</h2>
          {entries.map((e) => {
            const sel: Selection = {
              type: 'entry',
              file: e.file,
              pointer: e.pointer,
              origin: e.origin,
            };
            const c = counts(overview.validation[e.file], e.pointer);
            return (
              <div key={`${e.file}${e.pointer}`} className="tree-row">
                <button
                  type="button"
                  className={`tree-item ${sameSelection(selection, sel) ? 'tree-item--active' : ''}`}
                  onClick={() => onSelect(sel)}
                >
                  <span>
                    {e.name ?? e.id} <span className="tree-id">{e.id}</span>
                  </span>
                  {c.errors ? <span className="badge badge--error">{c.errors}</span> : null}
                  {!c.errors && c.warnings ? (
                    <span className="badge badge--warning">{c.warnings}</span>
                  ) : null}
                </button>
                <span className="tree-row-actions">
                  <ConfirmButton
                    compact
                    className="icon-button"
                    label={`Remove ${e.name ?? e.id}`}
                    hint={removeHint(e)}
                    onConfirm={() => props.onRemove(e)}
                  />
                </span>
              </div>
            );
          })}
        </div>
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
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="Entry kind"
          >
            <option value="">entry (generic)</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Entry name"
          />
          <button type="submit" className="button" disabled={!name.trim()}>
            Add
          </button>
          {error ? <div className="field-note field-note--error">{error}</div> : null}
        </form>
      ) : null}
    </div>
  );
}
