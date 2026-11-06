import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { DocumentFormat, EntrySummary, ValidationResult } from '@shared/types';
import { buildPointer } from '@shared/pointer';
import { DsdsDocument, formatFromFilename } from '../documents/document';
import { packForSchemaVersion, type PackMatch } from '../packs';
import { validateDocument } from '../validator/adapter';
import { loadPackRuntime, type ResolveResult } from '../validator/pack-runtime';

export interface ProjectDocument {
  /** Path relative to the project root, with forward slashes. */
  path: string;
  absPath: string;
  format: DocumentFormat;
  doc: DsdsDocument;
}

export interface LoadOptions {
  /** Project directory. Documents are only read from here and its subdirectories. */
  dir: string;
  /**
   * Start from this file (relative to `dir`) and follow `rel: file` refs. When omitted, every
   * matching file under `dir` is one project (upstream processing model §3).
   */
  rootFile?: string;
  /** Which files count as documents when discovering. Default: `*.dsds.yaml|yml|json`. */
  include?: RegExp;
  /** Descend into subdirectories when discovering. Default true. */
  recursive?: boolean;
}

export interface ProjectProblem {
  file: string;
  message: string;
}

const DEFAULT_INCLUDE = /\.dsds\.(ya?ml|json)$/;
/** `.dsds-trash` holds files removed in the app, so a removal can be undone by hand. */
export const TRASH_DIR = '.dsds-trash';
const SKIP_DIRS = new Set(['.git', 'node_modules', TRASH_DIR]);

/** A set of DSDS documents read together: one design system, possibly split across files. */
export class Project {
  private constructor(
    readonly dir: string,
    readonly documents: ProjectDocument[],
    readonly problems: ProjectProblem[],
  ) {}

  static load(opts: LoadOptions): Project {
    const dir = resolve(opts.dir);
    const problems: ProjectProblem[] = [];
    const documents: ProjectDocument[] = [];
    const seen = new Set<string>();

    const read = (absPath: string): ProjectDocument | null => {
      if (seen.has(absPath)) return null;
      seen.add(absPath);
      const rel = relative(dir, absPath).split(sep).join('/');
      try {
        const doc = DsdsDocument.parse(readFileSync(absPath, 'utf8'), formatFromFilename(absPath));
        const pd: ProjectDocument = { path: rel, absPath, format: doc.format, doc };
        documents.push(pd);
        return pd;
      } catch (e) {
        problems.push({ file: rel, message: `could not read: ${(e as Error).message}` });
        return null;
      }
    };

    if (opts.rootFile) {
      const queue = [resolve(dir, opts.rootFile)];
      while (queue.length) {
        const abs = queue.shift() as string;
        if (!isInside(dir, abs)) {
          problems.push({ file: abs, message: 'refers to a file outside the project folder' });
          continue;
        }
        if (!existsSync(abs)) {
          problems.push({ file: relative(dir, abs), message: 'referenced file does not exist' });
          continue;
        }
        const pd = read(abs);
        if (!pd) continue;
        for (const href of fileRefs(pd.doc.toValue())) {
          if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // URLs are not project files
          queue.push(resolve(dirname(abs), href.split('#')[0] as string));
        }
      }
    } else {
      const include = opts.include ?? DEFAULT_INCLUDE;
      for (const abs of discover(dir, include, opts.recursive ?? true)) read(abs);
    }
    return new Project(dir, documents, problems);
  }

  /** Every entry and shared entry, across all documents. */
  entries(): EntrySummary[] {
    const out: EntrySummary[] = [];
    for (const { path, doc } of this.documents) {
      const value = doc.toValue();
      if (!isRecord(value)) continue;
      const push = (item: unknown, pointer: string, origin: EntrySummary['origin']) => {
        if (!isRecord(item) || typeof item.id !== 'string') return;
        out.push({
          id: item.id,
          kind: typeof item.kind === 'string' ? item.kind : null,
          name: typeof item.name === 'string' ? item.name : null,
          file: path,
          pointer,
          origin,
        });
      };
      if (doc.isBaseDocument) {
        asArray(value.entries).forEach((e, i) => push(e, buildPointer(['entries', i]), 'entries'));
        asArray(value.shared).forEach((e, i) => push(e, buildPointer(['shared', i]), 'shared'));
      } else {
        push(value, '', 'standalone');
      }
    }
    return out;
  }

  /** `schemaVersion` of the first base document that has one. */
  get schemaVersion(): string | null {
    return this.documents.find((d) => d.doc.schemaVersion)?.doc.schemaVersion ?? null;
  }

  /** The pack to use for this project, or null if none covers its schema version. */
  pack(): PackMatch | null {
    return packForSchemaVersion(this.schemaVersion);
  }

  /** Validate every document, resolving cross-file refs against the whole project. */
  validate(packVersion: string, strict = false): Map<string, ValidationResult> {
    const runtime = loadPackRuntime(packVersion);
    const cliEntities = this.documents.flatMap((d) => runtime.entriesIn(d.doc.toValue()));
    const out = new Map<string, ValidationResult>();
    for (const d of this.documents) {
      out.set(
        d.path,
        validateDocument(d.doc, packVersion, { filePath: d.absPath, cliEntities, strict }),
      );
    }
    return out;
  }

  /** Upstream's resolver: addresses, reuse, backlinks (`incoming`) and project-level problems. */
  resolve(packVersion: string): ResolveResult {
    const values = this.documents.map((d) => d.doc.toValue());
    return loadPackRuntime(packVersion).resolveProject(values);
  }
}

function isInside(root: string, abs: string): boolean {
  const rel = relative(root, abs);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function discover(dir: string, include: RegExp, recursive: boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (recursive) out.push(...discover(abs, include, recursive));
    } else if (include.test(name)) out.push(abs);
  }
  return out;
}

/** Targets of every `{rel: file, href}` pointer anywhere in a document. */
function fileRefs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => fileRefs(v, out));
  else if (isRecord(value)) {
    if (value.rel === 'file' && typeof value.href === 'string') out.push(value.href);
    for (const v of Object.values(value)) fileRefs(v, out);
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
