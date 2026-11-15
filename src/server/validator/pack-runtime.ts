import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Incoming, ResolvedEntry, ResolvedItem } from '@shared/types';
import { PACKS_DIR } from '../packs';

/** What a pack's reference validator reports (see packs/<v>/scripts/validate/validate.js). */
export interface RawFinding {
  rule: string | null;
  severity: 'error' | 'warning';
  pointer: string;
  message: string;
  fix: string | null;
  docs: string | null;
  offset?: number;
}

export interface ValidateDocOptions {
  /** Absolute path of the file, so relative file refs (DSDS-11) can be checked. */
  filePath?: string;
  /** Every entity across the project, so cross-file refs resolve. */
  cliEntities?: unknown[];
  sourceRoot?: string | null;
}

export interface ResolveResult {
  entries: Array<{
    id: string;
    kind: string | null;
    items: ResolvedItem[];
    incoming?: Incoming[];
    succession?: ResolvedEntry['succession'];
  }>;
  inlineLinks?: unknown[];
  problems: Array<{ code: string; at: string; message: string }>;
}

/** The two functions we call into a pack. Everything else about a pack stays an upstream detail. */
export interface PackRuntime {
  version: string;
  validateDoc(
    doc: unknown,
    opts?: ValidateDocOptions,
  ): { errors: string[]; warnings: string[]; findings: RawFinding[] };
  resolveProject(documents: unknown[]): ResolveResult;
  /** Upstream helper listing a document's entities (entries + shared, or the entry itself). */
  entriesIn(doc: unknown): unknown[];
  /** Upstream's address book of an entry: each address with what it names and its section kind. */
  itemAddresses(
    entity: unknown,
  ): Map<string, Array<{ type: string; pointer: string; sectionKind?: string }>>;
  /**
   * The pack's own `dsds-format`: puts fields in the order the schema files declare (style guide
   * §1-§6) by moving lines, so comments, quoting and unknown fields survive. Never throws.
   */
  formatText(text: string): FormatResult;
}

export interface FormatResult {
  text: string;
  changed: boolean;
  /** Out-of-order places the formatter would not touch, for the user to fix by hand. */
  unfixable: Array<{ pointer: string; reason: string; order: string[] }>;
  error?: string;
}

const cache = new Map<string, PackRuntime>();

/**
 * Load a pack's reference validator and resolver in-process. They are CommonJS and locate their
 * own schema files relative to themselves, so a pack stays self-contained. Cached per version.
 */
export function loadPackRuntime(version: string, packsDir = PACKS_DIR): PackRuntime {
  const key = `${packsDir}::${version}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const req = createRequire(join(packsDir, version, 'package.json'));
  const dir = join(packsDir, version, 'scripts');
  const validate = req(join(dir, 'validate/validate.js'));
  const resolve = req(join(dir, 'resolve/resolve.js'));
  const lib = req(join(dir, 'lib.js'));
  const format = req(join(dir, 'format/format.js'));
  const runtime: PackRuntime = {
    version,
    validateDoc: validate.validateDoc,
    resolveProject: resolve.resolveProject,
    entriesIn: lib.entriesIn,
    itemAddresses: lib.itemAddresses,
    formatText: format.formatText,
  };
  cache.set(key, runtime);
  return runtime;
}
