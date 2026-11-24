import { useEffect, useState } from 'react';
import type { DiffResult, EntryChange } from '@shared/types';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@web/components/ui/dialog';
import { kindLabels } from '@shared/namespaced';
import { api } from './api';

export interface CompareTarget {
  /** A version id, or `HEAD` for the latest version. */
  from: string;
  /** What the older side is called, for the heading. */
  label: string;
}

const STATUS_WORD = { added: 'Added', removed: 'Removed', changed: 'Changed' } as const;

function summary(entries: EntryChange[]): string {
  const n = (s: EntryChange['status']) => entries.filter((e) => e.status === s).length;
  const parts = [
    [n('changed'), 'changed'],
    [n('added'), 'added'],
    [n('removed'), 'removed'],
  ].filter(([count]) => count !== 0);
  return parts.map(([count, word]) => `${count} ${word}`).join(', ');
}

function Entry({ e, kinds }: { e: EntryChange; kinds: Map<string, string> }) {
  const title = e.name ?? e.id;
  return (
    <li className="diff-entry">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="min-w-0 truncate">{title}</strong>
        <span className={`badge diff-status diff-status--${e.status}`}>
          {STATUS_WORD[e.status]}
        </span>
        {e.kind ? <span className="badge">{kinds.get(e.kind) ?? e.kind}</span> : null}
        {e.deprecated ? <span className="badge badge--warning">now deprecated</span> : null}
        <span className="diff-where">{e.file}</span>
      </div>
      {e.warning ? <p className="field-note field-note--error">{e.warning}</p> : null}
      {e.fields.length > 0 ? (
        <ul className="diff-fields">
          {e.fields.map((f) => (
            <li key={f.path} className="diff-field">
              <code className="diff-where">{f.path || '(entry)'}</code>
              {f.before !== undefined ? <span className="diff-before">{f.before}</span> : null}
              {f.after !== undefined ? <span className="diff-after">{f.after}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * What changed between a saved version and the files as they are now, entry by entry. Reviewing the
 * draft compares the latest version; the history compares any earlier one.
 */
export function ChangesDialog(props: {
  slug: string;
  target: CompareTarget | null;
  onClose(): void;
}) {
  const { slug, target } = props;
  // The result remembers which target it answers, so a new target never shows the old result.
  const [result, setResult] = useState<{
    target: CompareTarget;
    diff?: DiffResult;
    error?: string;
  } | null>(null);
  const current = result && result.target === target ? result : null;
  const diff = current?.diff ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    if (!target) return;
    let live = true;
    api
      .diff(slug, target.from, 'working')
      .then((d) => live && setResult({ target, diff: d }))
      .catch((e: Error) => live && setResult({ target, error: e.message }));
    return () => {
      live = false;
    };
  }, [slug, target]);

  // A custom kind is shown by its own name, without its namespace.
  const kinds = kindLabels((diff?.entries ?? []).flatMap((e) => (e.kind ? [e.kind] : [])));

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Changes since {target?.label}</DialogTitle>
          <DialogDescription>
            {diff ? (diff.entries.length === 0 ? 'No differences.' : summary(diff.entries)) : ' '}
            {diff && diff.entries.length > 0 ? ' · compared with the files as they are now' : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? <p className="field-note field-note--error">{error}</p> : null}
          {!diff && !error ? <p className="muted">Comparing…</p> : null}
          {diff && diff.entries.length > 0 ? (
            <ul className="diff-list">
              {diff.entries.map((e) => (
                <Entry key={e.key} e={e} kinds={kinds} />
              ))}
            </ul>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
