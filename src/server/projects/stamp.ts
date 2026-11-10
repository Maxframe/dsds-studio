import { join } from 'node:path';
import type { EditOp } from '@shared/types';
import { applyOpsToFile } from '../documents/edit';
import { diffRevisions } from './diff';
import { headVersion } from './versions';

/** Today's date as the spec writes dates in `metadata`: `YYYY-MM-DD`. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const isStampPath = (path: string) =>
  path === '/metadata/updated' || path.startsWith('/metadata/updated/');

/**
 * Set `metadata.updated` (today, with `note`) on every entry that changed since the latest version.
 * The spec says consumers should treat `updated.date` as the cache key for an item's documentation,
 * so a saved version carries it. Skipped: removed entries, the base document (it has no metadata),
 * entries whose only change is an earlier stamp, and a project's first version (everything is new).
 * Returns how many entries were stamped.
 */
export function stampChanged(dir: string, note: string, date = today()): number {
  const head = headVersion(dir);
  if (!head) return 0;
  const perFile = new Map<string, EditOp[]>();
  for (const e of diffRevisions(dir, head, 'working').entries) {
    if (e.status === 'removed' || e.key.startsWith('@base')) continue;
    if (e.status === 'changed' && e.fields.every((f) => isStampPath(f.path))) continue;
    const ops = perFile.get(e.file) ?? [];
    ops.push({ op: 'set', pointer: `${e.pointer}/metadata/updated`, value: { date, note } });
    perFile.set(e.file, ops);
  }
  for (const [file, ops] of perFile) {
    // `file` comes from the project's own document list, so it is already inside the folder.
    applyOpsToFile(dir, join(dir, file), ops);
  }
  return [...perFile.values()].reduce((n, ops) => n + ops.length, 0);
}
