import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DiffResult, EntryChange, FieldChange } from '@shared/types';
import { DsdsDocument } from '../documents/document';
import { DOCUMENT_FILE } from '../workspace';
import { TRASH_DIR } from './project';

/**
 * Entry-level comparison of two revisions. Documents are parsed and compared as data, so key
 * order, quoting and comments never count as changes. Entries are matched by `uuid` when they have
 * one, otherwise by `id` (Specification §3.1): a vanished id is flagged, because the validator sees
 * one revision only and cannot check that published ids stay put.
 */
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const SHORT = 200;
const BASE_KEY = '@base';

interface Snap {
  key: string;
  id: string;
  file: string;
  /** Where the entry sits in its document: `/entries/2`, `/shared/0`, or `` for a standalone file. */
  pointer: string;
  value: Rec;
}

const git = (dir: string, args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Document texts of a revision: a commit, or the files as they are now. */
function documentsAt(dir: string, rev: string): Map<string, string> {
  const out = new Map<string, string>();
  const skip = (p: string) => p.split('/').includes(TRASH_DIR) || p.split('/').includes('.git');
  if (rev === 'working') {
    (function walk(rel: string) {
      for (const name of readdirSync(join(dir, rel)).sort()) {
        const path = rel ? `${rel}/${name}` : name;
        if (skip(path) || name === 'node_modules') continue;
        if (statSync(join(dir, path)).isDirectory()) walk(path);
        else if (DOCUMENT_FILE.test(name)) out.set(path, readFileSync(join(dir, path), 'utf8'));
      }
    })('');
  } else {
    for (const path of git(dir, ['ls-tree', '-r', '--name-only', '-z', rev]).split('\0')) {
      if (path && DOCUMENT_FILE.test(path) && !skip(path))
        out.set(path, git(dir, ['show', `${rev}:${path}`]));
    }
  }
  return out;
}

/** The entries of every document in a revision, plus each base document's own top-level fields. */
function snapshot(dir: string, rev: string): Map<string, Snap> {
  const out = new Map<string, Snap>();
  const add = (value: Rec, file: string, pointer: string, key?: string) => {
    const id = typeof value.id === 'string' ? value.id : '';
    const k = key ?? (typeof value.uuid === 'string' ? value.uuid : id);
    if (k) out.set(k, { key: k, id: key ? 'base' : id, file, pointer, value });
  };
  for (const [file, text] of documentsAt(dir, rev)) {
    const doc = DsdsDocument.parse(text);
    if (doc.parseErrors.length) continue;
    const value = doc.toValue();
    if (!isRec(value)) continue;
    if (Array.isArray(value.entries)) {
      const { entries, shared, ...rest } = value;
      void entries;
      void shared;
      add(rest, file, '', 'schemaVersion' in value ? BASE_KEY : `${BASE_KEY}:${file}`);
      for (const name of ['entries', 'shared'] as const) {
        const list = value[name];
        (Array.isArray(list) ? list : []).forEach((e, i) => {
          if (isRec(e)) add(e, file, `/${name}/${i}`);
        });
      }
    } else add(value, file, '');
  }
  return out;
}

const short = (v: unknown): string => {
  const text = typeof v === 'string' ? v : JSON.stringify(v);
  return text.length > SHORT ? `${text.slice(0, SHORT)}…` : text;
};

/** Content equality that ignores key order. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (isRec(a) && isRec(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => k in a === k in b && same(a[k], b[k]));
  }
  return a === b;
}

function diffValue(before: unknown, after: unknown, path: string, out: FieldChange[]): void {
  if (same(before, after)) return;
  const pair = (a: Rec | unknown[], b: Rec | unknown[], keys: string[]) => {
    for (const k of keys) {
      const p = `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      const x = (a as Rec)[k];
      const y = (b as Rec)[k];
      if (!(k in a)) out.push({ path: p, change: 'added', after: short(y) });
      else if (!(k in b)) out.push({ path: p, change: 'removed', before: short(x) });
      else diffValue(x, y, p, out);
    }
  };
  if (isRec(before) && isRec(after)) {
    pair(before, after, [...new Set([...Object.keys(before), ...Object.keys(after)])].sort());
  } else if (Array.isArray(before) && Array.isArray(after)) {
    const n = Math.max(before.length, after.length);
    pair(
      before,
      after,
      Array.from({ length: n }, (_, i) => String(i)),
    );
  } else out.push({ path, change: 'changed', before: short(before), after: short(after) });
}

const statuses = (v: Rec): string[] => {
  const meta = v.metadata;
  const s = isRec(meta) ? meta.status : undefined;
  return (Array.isArray(s) ? s : [s]).flatMap((x) =>
    isRec(x) && typeof x.status === 'string' ? [x.status] : [],
  );
};

const describe = (s: Snap): Pick<EntryChange, 'name' | 'kind'> => ({
  name: typeof s.value.name === 'string' ? s.value.name : null,
  kind: typeof s.value.kind === 'string' ? s.value.kind : null,
});

const STUB =
  'Published ids should not change (Specification §3.1). Keep the old entry as a deprecated stub whose replacedBy names the new one.';

/** Compare `from` (a commit id) with `to` (a commit id, or `working` for the files as they are). */
export function diffRevisions(dir: string, from: string, to: string): DiffResult {
  const a = snapshot(dir, from);
  const b = snapshot(dir, to);
  const entries: EntryChange[] = [];
  for (const [key, after] of b) {
    const before = a.get(key);
    if (!before) {
      entries.push({
        key,
        id: after.id,
        ...describe(after),
        file: after.file,
        pointer: after.pointer,
        status: 'added',
        fields: [],
      });
      continue;
    }
    const fields: FieldChange[] = [];
    diffValue(before.value, after.value, '', fields);
    if (fields.length === 0) continue;
    const change: EntryChange = {
      key,
      id: after.id,
      ...describe(after),
      file: after.file,
      pointer: after.pointer,
      status: 'changed',
      fields,
    };
    if (before.id !== after.id && key !== BASE_KEY) {
      change.idChanged = { from: before.id, to: after.id };
      change.warning = `The id changed from "${before.id}" to "${after.id}". ${STUB}`;
    }
    if (
      statuses(after.value).includes('deprecated') &&
      !statuses(before.value).includes('deprecated')
    )
      change.deprecated = true;
    entries.push(change);
  }
  for (const [key, before] of a) {
    if (b.has(key)) continue;
    entries.push({
      key,
      id: before.id,
      ...describe(before),
      file: before.file,
      pointer: before.pointer,
      status: 'removed',
      fields: [],
      warning: key.startsWith(BASE_KEY)
        ? undefined
        : `The id "${before.id}" no longer exists. ${STUB}`,
    });
  }
  entries.sort(
    (x, y) =>
      Number(y.key.startsWith(BASE_KEY)) - Number(x.key.startsWith(BASE_KEY)) ||
      x.id.localeCompare(y.id),
  );
  return { from, to, entries };
}
