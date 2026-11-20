import { hashes, scanFiles, SnapshotStore, type Manifest } from './snapshots';
import type { DraftChange, DraftState, VersionInfo } from '@shared/types';

/**
 * A project's versions are snapshots of its folder, kept by the app outside the project (ADR 0006).
 * The draft is whatever differs from the latest version that was not saved automatically.
 */
const storeOf = (dir: string) => new SnapshotStore(dir);

export function hasVersion(dir: string): boolean {
  return storeOf(dir).baseline() !== null;
}

/** The first version of a new project, so a draft can be measured from day one. */
export function createInitialVersion(dir: string): void {
  storeOf(dir).create({ label: 'Initial version', kind: 'named' });
}

export function draftOf(dir: string): DraftState {
  const base = storeOf(dir).baseline();
  const now = hashes(scanFiles(dir));
  const before = base?.files ?? {};
  const changed: DraftChange[] = [];
  for (const path of Object.keys(now).sort()) {
    if (!(path in before)) changed.push({ path, status: 'added' });
    else if (before[path] !== now[path]) changed.push({ path, status: 'modified' });
  }
  for (const path of Object.keys(before).sort()) {
    if (!(path in now)) changed.push({ path, status: 'deleted' });
  }
  changed.sort((a, b) => a.path.localeCompare(b.path));
  return { hasVersion: base !== null, changed, suggestedTag: null };
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Return the files to the last version. First the unsaved state is saved as an automatic version
 * (shown in the history as a quicksave), so a discard can be undone. Returns whether anything was
 * discarded.
 */
export function discardDraft(dir: string): boolean {
  const store = storeOf(dir);
  const base = store.baseline();
  if (!base) throw new Error('There is no saved version to go back to yet');
  if (draftOf(dir).changed.length === 0) return false;
  store.create({
    label: `Before discarding changes ${stamp(new Date())}`,
    kind: 'quicksave',
    auto: true,
  });
  store.apply(base);
  return true;
}

export const tagExists = (dir: string, tag: string): boolean =>
  storeOf(dir)
    .list()
    .some((m) => m.tags.includes(tag));

const TAG = /^[A-Za-z0-9][A-Za-z0-9._+/-]{0,99}$/;

/** Why a tag name can't be used, or null when it can. */
export function tagProblem(dir: string, tag: string): string | null {
  if (!TAG.test(tag) || tag.endsWith('/') || tag.includes('//') || tag.includes('..'))
    return `"${tag}" is not a valid tag name`;
  return tagExists(dir, tag) ? `A version is already tagged "${tag}"` : null;
}

export interface SaveRequest {
  /** Empty for a quicksave (the label is a timestamp). */
  label?: string;
  tag?: string;
  /** Runs after the request is validated and before the snapshot, to change files that belong in it. */
  beforeCommit?: () => void;
}

/**
 * Save the draft as a version: one snapshot of everything. A quicksave has an automatic label; a
 * named version has the given label and may carry a tag. Throws a message fit to show the user.
 */
export function saveVersion(dir: string, req: SaveRequest = {}): void {
  const label = req.label?.trim() ?? '';
  const tag = req.tag?.trim() ?? '';
  if (tag && !label) throw new Error('A tag needs a named version: give it a label');
  if (draftOf(dir).changed.length === 0) throw new Error('There are no changes to save');
  if (tag) {
    const problem = tagProblem(dir, tag);
    if (problem) throw new Error(problem);
  }
  req.beforeCommit?.();
  storeOf(dir).create({
    label: label || `Quicksave ${stamp(new Date())}`,
    kind: label ? 'named' : 'quicksave',
    tags: tag ? [tag] : [],
  });
}

const info = (m: Manifest): VersionInfo => ({
  id: m.id,
  label: m.label,
  date: m.date,
  kind: m.kind,
  tags: m.tags,
});

/** The project's versions, newest first. Empty until the first version exists. */
export function listVersions(dir: string): VersionInfo[] {
  return storeOf(dir).list().map(info);
}

/** True when `id` is a version of this project. */
export function isVersion(dir: string, id: string): boolean {
  return storeOf(dir).get(id) !== null;
}

/** Tag an existing version, under the same rules as a tag given when saving. */
export function tagVersion(dir: string, id: string, tag: string): void {
  const name = tag.trim();
  if (!name) throw new Error('Give the tag a name');
  const problem = tagProblem(dir, name);
  if (problem) throw new Error(problem);
  const store = storeOf(dir);
  const m = store.get(id);
  if (!m) throw new Error('Version not found');
  store.write({ ...m, tags: [...m.tags, name] });
}

/** Give a version a name after the fact. Only its manifest changes; the saved files do not. */
export function nameVersion(dir: string, id: string, label: string): void {
  const name = label.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!name) throw new Error('Give the version a name');
  const store = storeOf(dir);
  const m = store.get(id);
  if (!m) throw new Error('Version not found');
  store.write({ ...m, label: name, kind: 'named' });
}

/** The id of the version the draft is measured from, or null before the first one. */
export function headVersion(dir: string): string | null {
  return storeOf(dir).baseline()?.id ?? null;
}

/**
 * Make the files match an earlier version and save that as a new version on top, so history is
 * kept and a restore can itself be undone. Refuses while there are unsaved changes: the caller
 * quicksaves or discards them first.
 */
export function restoreVersion(dir: string, id: string): void {
  if (draftOf(dir).changed.length > 0) {
    throw new Error('There are unsaved changes: save or discard them before restoring a version');
  }
  const store = storeOf(dir);
  const target = store.get(id);
  if (!target) throw new Error('Version not found');
  const now = hashes(scanFiles(dir));
  const same =
    Object.keys(now).length === Object.keys(target.files).length &&
    Object.entries(target.files).every(([path, hash]) => now[path] === hash);
  if (same) throw new Error('The files already match this version');
  store.apply(target);
  store.create({ label: `Restored “${target.label}”`, kind: 'named', restoredFrom: id });
}
