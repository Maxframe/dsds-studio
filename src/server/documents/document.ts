import type { Document } from 'yaml';
import { isMap, isSeq, parseDocument as parseYamlDocument, type Node } from 'yaml';
import type { DocumentFormat } from '@shared/types';
import { parsePointer } from '@shared/pointer';

/**
 * A DSDS document held as a YAML AST so edits keep comments, key order and fields we do not
 * understand (upstream requires consumers to preserve `$extensions`). JSON is parsed as YAML
 * (JSON is a YAML subset) and written back as JSON.
 *
 * An unmodified document serializes to its original text, byte for byte.
 */
export class DsdsDocument {
  private modified = false;

  private constructor(
    readonly format: DocumentFormat,
    private readonly original: string,
    private readonly ast: Document,
    readonly parseErrors: string[],
  ) {}

  static parse(text: string, format: DocumentFormat = detectFormat(text)): DsdsDocument {
    const ast = parseYamlDocument(text, { keepSourceTokens: false, prettyErrors: false });
    const parseErrors = ast.errors.map((e) => e.message);
    return new DsdsDocument(format, text, ast, parseErrors);
  }

  /** Plain JS value of the document (dates stay strings: YAML 1.2 core schema). */
  toValue(): unknown {
    return this.ast.toJS();
  }

  get isModified(): boolean {
    return this.modified;
  }

  /** The top-level `schemaVersion`, or null for a standalone entry / unparsable document. */
  get schemaVersion(): string | null {
    const v = this.ast.get('schemaVersion');
    return typeof v === 'string' ? v : null;
  }

  get isBaseDocument(): boolean {
    return this.ast.has('schemaVersion');
  }

  getAt(pointer: string): unknown {
    const node = this.ast.getIn(this.path(pointer), true) as Node | undefined;
    return node && typeof (node as { toJSON?: unknown }).toJSON === 'function'
      ? (node as { toJSON(): unknown }).toJSON()
      : node;
  }

  hasAt(pointer: string): boolean {
    return pointer === '' ? true : this.ast.hasIn(this.path(pointer));
  }

  /** Set (or add) the value at a JSON Pointer. Comments on untouched nodes are kept. */
  setAt(pointer: string, value: unknown): void {
    const path = this.path(pointer);
    if (path.length === 0) throw new Error('Cannot replace the document root');
    this.ast.setIn(path, this.ast.createNode(value));
    this.modified = true;
  }

  /** Remove the value at a JSON Pointer. Returns whether something was removed. */
  removeAt(pointer: string): boolean {
    const removed = this.ast.deleteIn(this.path(pointer));
    if (removed) this.modified = true;
    return removed;
  }

  /** Append to the sequence at `pointer`. */
  appendAt(pointer: string, value: unknown): void {
    const seq = this.ast.getIn(this.path(pointer), true);
    if (!isSeq(seq)) throw new Error(`${pointer || '/'} is not a list`);
    seq.add(this.ast.createNode(value));
    this.modified = true;
  }

  /** Move a list item from one index to another, keeping the item (and its comments) intact. */
  moveAt(pointer: string, from: number, to: number): void {
    const seq = this.ast.getIn(this.path(pointer), true);
    if (!isSeq(seq)) throw new Error(`${pointer || '/'} is not a list`);
    if (!seq.items[from] || to < 0 || to >= seq.items.length) throw new Error('Index out of range');
    const [item] = seq.items.splice(from, 1);
    seq.items.splice(to, 0, item as (typeof seq.items)[number]);
    this.modified = true;
  }

  /** Serialize. Unmodified documents return the original text exactly. */
  toText(): string {
    if (!this.modified) return this.original;
    return this.render();
  }

  /** Force a serialization through the AST, even when unmodified (used to test fidelity). */
  render(): string {
    if (this.format === 'json') return JSON.stringify(this.ast.toJS(), null, 2) + '\n';
    return this.ast.toString({ lineWidth: 0 });
  }

  /**
   * Turn a JSON Pointer into a yaml path, using numbers for list indexes so `setIn` /
   * `getIn` address sequences correctly.
   */
  private path(pointer: string): Array<string | number> {
    const out: Array<string | number> = [];
    let node: unknown = this.ast.contents;
    for (const seg of parsePointer(pointer)) {
      if (isSeq(node)) {
        const index = Number(seg);
        if (!Number.isInteger(index)) throw new Error(`"${seg}" is not a list index`);
        out.push(index);
        node = node.items[index];
      } else {
        out.push(seg);
        node = isMap(node) ? node.get(seg, true) : undefined;
      }
    }
    return out;
  }
}

/** `{` or `[` first → JSON; anything else is YAML. */
export function detectFormat(text: string): DocumentFormat {
  return /^\s*[{[]/.test(text) ? 'json' : 'yaml';
}

export function formatFromFilename(name: string): DocumentFormat {
  return name.endsWith('.json') ? 'json' : 'yaml';
}
