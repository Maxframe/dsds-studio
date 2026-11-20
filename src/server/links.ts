import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FolderInspection, FolderListing, LinkedProject } from '@shared/types';
import { Project } from './projects/project';
import { dataRoot } from './projects/snapshots';

/**
 * Folders opened from anywhere on disk (M3c). The registry lives in the data folder, one file per
 * workspace; the folders themselves are only ever read and written inside the documentation folder.
 */
export class LinkStore {
  constructor(readonly file: string) {}

  static forWorkspace(root: string): LinkStore {
    const key = createHash('sha1').update(resolve(root)).digest('hex').slice(0, 12);
    return new LinkStore(join(dataRoot(), 'links', `${key}.json`));
  }

  list(): LinkedProject[] {
    if (!existsSync(this.file)) return [];
    try {
      const value = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      if (!Array.isArray(value)) return [];
      // Entries written before the folder was called "documentation" used `specDir`.
      return value.map((v: Record<string, unknown>) =>
        'specDir' in v && !('documentationDir' in v)
          ? ({ ...v, documentationDir: v.specDir, specDir: undefined } as unknown as LinkedProject)
          : (v as unknown as LinkedProject),
      );
    } catch {
      return [];
    }
  }

  get(slug: string): LinkedProject | null {
    return this.list().find((l) => l.slug === slug) ?? null;
  }

  save(links: LinkedProject[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(links, null, 2)}\n`);
  }

  add(link: LinkedProject): void {
    this.save([...this.list().filter((l) => l.slug !== link.slug), link]);
  }

  remove(slug: string): boolean {
    const all = this.list();
    if (!all.some((l) => l.slug === slug)) return false;
    this.save(all.filter((l) => l.slug !== slug));
    return true;
  }
}

/** `rel` as a clean path below `root`, or null when it is absolute or climbs out of it. */
export function insideRoot(root: string, rel: string): string | null {
  if (isAbsolute(rel)) return null;
  const abs = resolve(root, rel);
  const back = relative(root, abs);
  if (back.startsWith('..') || isAbsolute(back)) return null;
  return back.split(sep).join('/');
}

const HIDDEN_OR_BULKY = new Set(['node_modules', 'dist', 'build', 'coverage']);
const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** The subfolders of a folder, for the folder picker. Starts at the home folder. */
export function listFolders(path?: string): FolderListing {
  const home = homedir();
  const abs = resolve(path && path.trim() ? path : home);
  if (!isAbsolute(abs) || !isDir(abs)) throw new Error('That is not a folder');
  const folders: { name: string; path: string }[] = [];
  let names: string[];
  try {
    names = readdirSync(abs).sort((a, b) => a.localeCompare(b));
  } catch {
    throw new Error('That folder cannot be read');
  }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const child = join(abs, name);
    if (isDir(child)) folders.push({ name, path: child });
    if (folders.length >= 500) break;
  }
  const parent = dirname(abs);
  return { path: abs, parent: parent === abs ? null : parent, home, folders };
}

const DOCUMENT = /\.dsds\.(ya?ml|json)$/;
const TOKEN_FILES = /^(\$themes\.json|\$metadata\.json|tokens\.json|.+\.tokens\.json)$/;
const MAX_DEPTH = 6;

/**
 * Look for the two things the setup asks about: where DSDS documents already are, and where design
 * tokens might be. Shallowest first. Only suggestions: the user decides.
 */
export function inspectFolder(root: string): FolderInspection {
  const abs = resolve(root);
  if (!isDir(abs)) throw new Error('That is not a folder');
  const documents = new Set<string>();
  const tokens = new Set<string>();
  const walk = (rel: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(join(abs, rel)).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith('.') || HIDDEN_OR_BULKY.has(name)) continue;
      const path = rel ? `${rel}/${name}` : name;
      if (isDir(join(abs, path))) {
        if (depth < MAX_DEPTH) walk(path, depth + 1);
      } else if (DOCUMENT.test(name)) documents.add(rel || '.');
      else if (TOKEN_FILES.test(name)) tokens.add(rel || '.');
    }
  };
  walk('', 0);
  const byDepth = (a: string, b: string) =>
    a.split('/').length - b.split('/').length || a.localeCompare(b);
  const documentationDirs = [...documents].sort(byDepth).slice(0, 5);
  let name = '';
  const first = documentationDirs[0];
  if (first !== undefined) {
    try {
      name = Project.load({ dir: join(abs, first) }).title() ?? '';
    } catch {
      /* unreadable documents: the user names it */
    }
  }
  return {
    path: abs,
    folder: abs.split(sep).filter(Boolean).pop() ?? 'project',
    name,
    documentationDirs,
    tokenDirs: [...tokens].sort(byDepth).slice(0, 5),
  };
}
