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
  /**
   * Advisory findings from the pack's lint ("is this documentation good?"). Kept apart from
   * `findings` so they never change `ok`, `errors` or `warnings`.
   */
  advice?: Finding[];
}

/** One file that differs from the project's last saved version. */
export interface DraftChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

/** The draft: what has changed since the last saved version. */
export interface DraftState {
  /** False until the project has a first saved version (an older project, or a folder without git). */
  hasVersion: boolean;
  changed: DraftChange[];
  /** The system's `metadata.version`, offered as the tag for a named version while it is untagged. */
  suggestedTag: string | null;
}

/** One saved version in a project's history. */
export interface VersionInfo {
  /** Full commit id. */
  id: string;
  label: string;
  /** ISO 8601 author date. */
  date: string;
  /** A quicksave has an automatic label; a named version was given one (when saved, or later). */
  kind: 'quicksave' | 'named';
  tags: string[];
}

/** One field that differs between two revisions of an entry. */
export interface FieldChange {
  /** JSON Pointer inside the entry. */
  path: string;
  change: 'added' | 'removed' | 'changed';
  /** Short text of the old / new value (shortened when long). */
  before?: string;
  after?: string;
}

/** One entry that differs between two revisions. */
export interface EntryChange {
  /** The entry's `uuid` when it has one, otherwise its `id`; `@base` for the base document itself. */
  key: string;
  id: string;
  name: string | null;
  kind: string | null;
  /** Document the entry lives in, in the newer revision (the older one for a removed entry). */
  file: string;
  /** Where the entry sits in that document: `/entries/2`, `/shared/0`, or `` for a standalone file. */
  pointer: string;
  status: 'added' | 'removed' | 'changed';
  fields: FieldChange[];
  /** Set when the same entry (found by uuid) has a different id now. */
  idChanged?: { from: string; to: string };
  /** The entry's status became `deprecated` in this change. */
  deprecated?: boolean;
  /** Guidance when an id went away (Specification §3.1: published ids should not change). */
  warning?: string;
}

/** A structural, entry-level comparison of two revisions of a project. */
export interface DiffResult {
  from: string;
  to: string;
  entries: EntryChange[];
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
  /** `entry` for a whole entry; for an address inside one, what it is (`item`, `trait`, ...). */
  type?: string;
  /** For an `item`: the kind of section it sits in (`guidelines`, `definitions`, `steps`, ...). */
  sectionKind?: string;
}

/**
 * Where a deprecated thing went (Processing §7): the entries it names as replacements, and where
 * following them on through replacements that are themselves deprecated ends. Several successors are
 * not chosen between: the deprecation notice says which to use when.
 */
export interface Succession {
  replacedBy: string[];
  successors: string[];
  choose: boolean;
}

/** One thing in an entry that can be pointed at, as the pack's resolver sees it. */
export interface ResolvedItem {
  address: string;
  type: string;
  /** Where it is, inside its entry (`/sections/0/items/1`). */
  pointer: string;
  sectionKind?: string;
  /** For an item that reuses another through `same-as`: what it reuses, and the item that states it. */
  reuses?: string;
  origin?: string;
  /** The item's effective content: its own fields, plus the rest from what it reuses (§4). */
  content?: Record<string, unknown>;
  /** For a deprecated trait or trait value: what replaces it. */
  succession?: Succession;
}

/** A pointer at an entry, seen from the entry it points at (§5). */
export interface Incoming {
  rel: string;
  /** The entry, or `entry#address` for an item inside it, that holds the pointer. */
  from: string;
  /** Exactly where: the entry id, then the pointer inside it (`dialog/uses/0`). */
  pointer: string;
  /** The address inside this entry the pointer names, when it names one. */
  at?: string;
}

export interface ResolvedEntry {
  kind: string | null;
  items: ResolvedItem[];
  incoming?: Incoming[];
  succession?: Succession;
}

/** What the pack's resolver works out for a whole project, by entry id. */
export interface ResolvedProject {
  entries: Record<string, ResolvedEntry>;
}
