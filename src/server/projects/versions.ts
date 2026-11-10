import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DraftChange, DraftState, VersionInfo } from '@shared/types';
import { TRASH_DIR } from './project';

/**
 * A project's versions are commits in its own git repo, made with the local `git` CLI (ADR 0005).
 * The draft is whatever differs from the last commit. Every call runs inside the project folder and
 * refuses a folder that is not its own repo: git would otherwise walk up and use a parent repo.
 */
const NOT_TRACKED = `:!${TRASH_DIR}`;

const run = (dir: string, args: string[], env: NodeJS.ProcessEnv = process.env): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });

export const isRepo = (dir: string): boolean => existsSync(join(dir, '.git'));

export function hasVersion(dir: string): boolean {
  if (!isRepo(dir)) return false;
  try {
    run(dir, ['rev-parse', '--verify', '-q', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

/** git needs an author to commit or stash. Use the configured one; fall back so saving never fails. */
function identity(dir: string): NodeJS.ProcessEnv {
  let configured = '';
  try {
    configured = run(dir, ['config', 'user.name']).trim();
  } catch {
    /* unset */
  }
  if (configured) return process.env;
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'DSDS Studio',
    GIT_AUTHOR_EMAIL: 'dsds-studio@localhost',
    GIT_COMMITTER_NAME: 'DSDS Studio',
    GIT_COMMITTER_EMAIL: 'dsds-studio@localhost',
  };
}

/** The first version of a new project, so a draft can be measured from day one. */
export function commitInitialVersion(dir: string): void {
  run(dir, ['add', '-A', '--', '.', NOT_TRACKED]);
  run(
    dir,
    ['-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'Initial version'],
    identity(dir),
  );
}

export function draftOf(dir: string): DraftState {
  const version = hasVersion(dir);
  if (!isRepo(dir)) return { hasVersion: false, changed: [], suggestedTag: null };
  const out = run(dir, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    '.',
    NOT_TRACKED,
  ]);
  const parts = out.split('\0').filter(Boolean);
  const changed: DraftChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i]?.slice(0, 2) ?? '';
    const path = parts[i]?.slice(3) ?? '';
    // A rename or copy is followed by its original path as a separate entry.
    if (code.includes('R') || code.includes('C')) i++;
    const status =
      code === '??' || code.includes('A') ? 'added' : code.includes('D') ? 'deleted' : 'modified';
    changed.push({ path, status });
  }
  return { hasVersion: version, changed, suggestedTag: null };
}

/**
 * Return the files to the last version. The discarded changes (new files included) go to a git
 * stash, so a discard can still be undone by hand. Returns whether anything was discarded.
 */
export function discardDraft(dir: string): boolean {
  if (!hasVersion(dir)) throw new Error('There is no saved version to go back to yet');
  if (draftOf(dir).changed.length === 0) return false;
  run(
    dir,
    [
      'stash',
      'push',
      '--include-untracked',
      '-m',
      `Discarded draft ${new Date().toISOString()}`,
      '--',
      '.',
      NOT_TRACKED,
    ],
    identity(dir),
  );
  return true;
}

export const tagExists = (dir: string, tag: string): boolean => {
  try {
    run(dir, ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]);
    return true;
  } catch {
    return false;
  }
};

/** Why a tag name can't be used, or null when it can. */
export function tagProblem(dir: string, tag: string): string | null {
  if (tag.startsWith('-')) return `"${tag}" is not a valid tag name`;
  try {
    run(dir, ['check-ref-format', `refs/tags/${tag}`]);
  } catch {
    return `"${tag}" is not a valid tag name`;
  }
  return tagExists(dir, tag) ? `A version is already tagged "${tag}"` : null;
}

export interface SaveRequest {
  /** Empty for a quicksave (the label is a timestamp). */
  label?: string;
  tag?: string;
  /** Runs after the request is validated and before the commit, to change files that belong in it. */
  beforeCommit?: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Save the draft as a version: one commit of everything changed. A quicksave has an automatic
 * label; a named version has the given label and may carry a tag. The kind goes in a commit trailer
 * so the history list can tell them apart. Throws a message fit to show the user.
 */
export function saveVersion(dir: string, req: SaveRequest = {}): void {
  if (!isRepo(dir)) throw new Error('This folder is not a git repository');
  const label = req.label?.trim() ?? '';
  const tag = req.tag?.trim() ?? '';
  if (tag && !label) throw new Error('A tag needs a named version: give it a label');
  if (draftOf(dir).changed.length === 0) throw new Error('There are no changes to save');
  if (tag) {
    const problem = tagProblem(dir, tag);
    if (problem) throw new Error(problem);
  }
  const env = identity(dir);
  req.beforeCommit?.();
  run(dir, ['add', '-A', '--', '.', NOT_TRACKED]);
  run(
    dir,
    [
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '-m',
      label || `Quicksave ${stamp(new Date())}`,
      '-m',
      `DSDS-Kind: ${label ? 'named' : 'quicksave'}`,
    ],
    env,
  );
  if (tag) run(dir, ['-c', 'tag.gpgsign=false', 'tag', tag, 'HEAD'], env);
}

/** Names given to quicksaves later live in git notes, so history is never rewritten. */
const NOTES_REF = 'dsds-label';
const FIELD = '\x1f';
const RECORD = '\x1e';

/** The project's versions, newest first. Empty until the first version exists. */
export function listVersions(dir: string): VersionInfo[] {
  if (!hasVersion(dir)) return [];
  const out = run(dir, [
    'log',
    `--notes=${NOTES_REF}`,
    `--format=%H%x1f%s%x1f%aI%x1f%(trailers:key=DSDS-Kind,valueonly,separator=)%x1f%D%x1f%N%x1e`,
  ]);
  return out
    .split(RECORD)
    .map((r) => r.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [id = '', subject = '', date = '', trailer = '', refs = '', note = ''] =
        record.split(FIELD);
      const named = note.trim();
      return {
        id,
        label: named || subject,
        date,
        // A version named later counts as named; so does one from before the trailer existed.
        kind:
          !named && trailer.trim() === 'quicksave' ? ('quicksave' as const) : ('named' as const),
        tags: refs
          .split(', ')
          .filter((r) => r.startsWith('tag: '))
          .map((r) => r.slice(5)),
      };
    });
}

/** True when `id` is a commit on the project's current history (not, say, a stash). */
export function isVersion(dir: string, id: string): boolean {
  if (!/^[0-9a-f]{40}$/.test(id) || !hasVersion(dir)) return false;
  try {
    run(dir, ['merge-base', '--is-ancestor', id, 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

/** Tag an existing version, under the same rules as a tag given when saving. */
export function tagVersion(dir: string, id: string, tag: string): void {
  const name = tag.trim();
  if (!name) throw new Error('Give the tag a name');
  const problem = tagProblem(dir, name);
  if (problem) throw new Error(problem);
  run(dir, ['-c', 'tag.gpgsign=false', 'tag', name, id], identity(dir));
}

/** Give a version a name after the fact. Stored as a git note: the commit itself is untouched. */
export function nameVersion(dir: string, id: string, label: string): void {
  const name = label.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!name) throw new Error('Give the version a name');
  run(dir, ['notes', `--ref=${NOTES_REF}`, 'add', '-f', '-m', name, id], identity(dir));
}

/** The commit id of the latest version, or null before the first one. */
export function headVersion(dir: string): string | null {
  if (!hasVersion(dir)) return null;
  return run(dir, ['rev-parse', 'HEAD']).trim();
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
  const label = listVersions(dir).find((v) => v.id === id)?.label ?? id.slice(0, 7);
  // Index and files become exactly that version's tree: files it lacks are removed too.
  run(dir, ['read-tree', '-u', '--reset', id]);
  try {
    run(dir, ['diff', '--cached', '--quiet', 'HEAD']);
    throw new Error('The files already match this version');
  } catch (e) {
    if ((e as Error).message === 'The files already match this version') throw e;
  }
  run(
    dir,
    [
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '-m',
      `Restored “${label}”`,
      '-m',
      `DSDS-Kind: named\nDSDS-Restored-From: ${id}`,
    ],
    identity(dir),
  );
}
