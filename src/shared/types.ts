/** Types shared by server and web. Keep this file pure: no Node or DOM imports. */

/** Manifest written to packs/<version>/pack.json by `npm run pack:add`. */
export interface PackInfo {
  /** DSDS spec version this pack was built from, e.g. "0.23.1". */
  version: string;
  /** Git tag in the upstream repo. */
  tag: string;
  /** Upstream commit the pack was taken from. */
  commit: string;
  /** ISO timestamp of when the pack was added. */
  addedAt: string;
}

export type Severity = 'error' | 'warning';

/** One validator finding. Mirrors the pack's `--json` finding shape. */
export interface Finding {
  /** Rule id such as "DSDS-05", or null for a pure JSON Schema / parse error. */
  rule: string | null;
  severity: Severity;
  /** JSON Pointer into the document ("" = root). */
  pointer: string;
  message: string;
  fix: string | null;
  /** Link to the rule's documentation. */
  docs: string | null;
  /** Character offset inside a Markdown field (inline links only). */
  offset?: number;
}

export interface ValidationResult {
  /** True when there are no errors (and no warnings in strict mode). */
  ok: boolean;
  errors: number;
  warnings: number;
  findings: Finding[];
  /** Pack version that produced this result. */
  packVersion: string;
}

export type DocumentFormat = 'yaml' | 'json';

/** One entry or shared entry found in a project. */
export interface EntrySummary {
  id: string;
  kind: string | null;
  name: string | null;
  /** Path of the owning document, relative to the project root. */
  file: string;
  /** JSON Pointer of the entry inside its document ("" for a standalone entry file). */
  pointer: string;
  /** Where it lives: `entries`, `shared`, or a standalone entry document. */
  origin: 'entries' | 'shared' | 'standalone';
}

/** An edit applied to a document by JSON Pointer. Applied on the server so comments survive. */
export type EditOp =
  | { op: 'set'; pointer: string; value: unknown }
  | { op: 'remove'; pointer: string }
  | { op: 'append'; pointer: string; value: unknown }
  | { op: 'move'; pointer: string; from: number; to: number };

export interface ProjectInfo {
  slug: string;
  documents: number;
}

export interface ProjectOverview {
  slug: string;
  schemaVersion: string | null;
  pack: { version: string; exact: boolean } | null;
  documents: Array<{ path: string; format: DocumentFormat }>;
  entries: EntrySummary[];
  problems: Array<{ file: string; message: string }>;
  validation: Record<string, ValidationResult>;
}

export interface FileState {
  format: DocumentFormat;
  text: string;
  value: unknown;
  validation?: ValidationResult | null;
}

export interface RefTarget {
  target: string;
  label: string;
}
