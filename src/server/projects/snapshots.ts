import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRASH_DIR } from './project';

/**
 * App-owned snapshots of a project's documentation folder (ADR 0006). File contents are stored once by hash;
 * a version is a small manifest that maps each path to a hash. Nothing is ever written into the
 * project folder.
 */
export const DEFAULT_DATA = join(dirname(fileURLToPath(import.meta.url)), '../../../data');
/** Folders that are never part of a snapshot. */
const SKIP = new Set(['.git', 'node_modules', TRASH_DIR]);

export interface Manifest {
  /** 40 hex characters. */
  id: string;
  /** Order of creation; dates alone tie within a second. */
  seq: number;
  label: string;
  kind: 'quicksave' | 'named';
  /** ISO 8601. */
  date: string;
  tags: string[];
  /** Path (relative, `/`-separated) to content hash. */
  files: Record<string, string>;
  /** Saved by the app before a discard or restore; never the baseline of the draft. */
  auto?: boolean;
  restoredFrom?: string;
}

const sha1 = (data: Buffer | string): string => createHash('sha1').update(data).digest('hex');

export const dataRoot = (): string => resolve(process.env.DSDS_DATA ?? DEFAULT_DATA);

/** Where the versions of a documentation folder live. The folder's absolute path is part of the name. */
export const storeDirOf = (dir: string): string =>
  join(dataRoot(), 'snapshots', `${basename(resolve(dir))}-${sha1(resolve(dir)).slice(0, 12)}`);

/** Every regular file below `dir` as path to content hash. Symbolic links are not followed. */
export function scanFiles(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  (function walk(rel: string) {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      if (SKIP.has(name)) continue;
      const path = rel ? `${rel}/${name}` : name;
      const stat = lstatSync(join(dir, path));
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) out.set(path, readFileSync(join(dir, path)));
    }
  })('');
  return out;
}

export const hashes = (files: Map<string, Buffer>): Record<string, string> =>
  Object.fromEntries([...files].map(([path, data]) => [path, sha1(data)]));

export class SnapshotStore {
  readonly root: string;

  constructor(readonly dir: string) {
    this.root = storeDirOf(dir);
  }

  private versionFile = (id: string) => join(this.root, 'versions', `${id}.json`);
  private blobFile = (hash: string) => join(this.root, 'blobs', hash);

  /** All manifests, newest first. */
  list(): Manifest[] {
    const dir = join(this.root, 'versions');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Manifest)
      .sort((a, b) => b.seq - a.seq);
  }

  get(id: string): Manifest | null {
    if (!/^[0-9a-f]{40}$/.test(id) || !existsSync(this.versionFile(id))) return null;
    return JSON.parse(readFileSync(this.versionFile(id), 'utf8')) as Manifest;
  }

  /** The version the draft is measured from: the latest one that was not saved automatically. */
  baseline(): Manifest | null {
    return this.list().find((m) => !m.auto) ?? null;
  }

  /** Save the files as they are now as a new version. */
  create(
    meta: Pick<Manifest, 'label' | 'kind'> &
      Partial<Pick<Manifest, 'auto' | 'restoredFrom' | 'tags'>>,
  ): Manifest {
    const files = scanFiles(this.dir);
    mkdirSync(join(this.root, 'blobs'), { recursive: true });
    mkdirSync(join(this.root, 'versions'), { recursive: true });
    for (const [hash, data] of [...files].map(([, d]) => [sha1(d), d] as const)) {
      if (!existsSync(this.blobFile(hash))) writeFileSync(this.blobFile(hash), data);
    }
    const seq = (this.list()[0]?.seq ?? 0) + 1;
    const date = new Date().toISOString();
    const manifest: Manifest = {
      id: sha1(`${seq}:${date}:${randomBytes(8).toString('hex')}`),
      seq,
      label: meta.label,
      kind: meta.kind,
      date,
      tags: meta.tags ?? [],
      files: hashes(files),
      ...(meta.auto ? { auto: true } : {}),
      ...(meta.restoredFrom ? { restoredFrom: meta.restoredFrom } : {}),
    };
    this.write(manifest);
    return manifest;
  }

  /** Replace a manifest (naming or tagging a version later). File contents never change. */
  write(manifest: Manifest): void {
    mkdirSync(join(this.root, 'versions'), { recursive: true });
    writeFileSync(this.versionFile(manifest.id), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  /** The text of a file in a version. */
  read(manifest: Manifest, path: string): Buffer | null {
    const hash = manifest.files[path];
    return hash && existsSync(this.blobFile(hash)) ? readFileSync(this.blobFile(hash)) : null;
  }

  /**
   * Make the folder match a version exactly: files it lacks are removed, the others written. Only
   * files a snapshot covers are touched, so linked or skipped folders stay as they are.
   */
  apply(manifest: Manifest): void {
    const current = scanFiles(this.dir);
    for (const path of current.keys()) {
      if (!(path in manifest.files)) rmSync(join(this.dir, path), { force: true });
    }
    const now = hashes(current);
    for (const [path, hash] of Object.entries(manifest.files)) {
      if (now[path] === hash) continue;
      const data = this.read(manifest, path);
      if (!data) throw new Error(`The snapshot is missing the stored copy of ${path}`);
      mkdirSync(dirname(join(this.dir, path)), { recursive: true });
      writeFileSync(join(this.dir, path), data);
    }
  }
}
