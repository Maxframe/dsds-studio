import { LineCounter, isMap, isScalar, isSeq, parseDocument, type Node, type Pair } from 'yaml';
import { buildPointer, parsePointer } from './pointer';

/** 1-based, inclusive line range in a YAML/JSON text. */
export interface LineRange {
  fromLine: number;
  toLine: number;
}

type Range = [number, number];

const keyText = (pair: Pair): string =>
  isScalar(pair.key) ? String(pair.key.value) : String((pair.key as { value?: unknown })?.value);

const rangeOf = (n: unknown): Range | null => {
  const r = (n as { range?: [number, number, number] | null } | null)?.range;
  return r ? [r[0], r[1]] : null;
};

/** The text span a map pair covers: from its key to the end of its value. */
function pairRange(pair: Pair): Range | null {
  const k = rangeOf(pair.key);
  if (!k) return null;
  const v = rangeOf(pair.value);
  return [k[0], Math.max(k[1], v ? v[1] : k[1])];
}

/**
 * Where a JSON Pointer sits in the text, as a line range. When the exact node does not exist (a
 * field not written yet), the nearest existing ancestor is used. Null for the document root or an
 * unparsable text.
 */
export function locatePointer(text: string, pointer: string): LineRange | null {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });
  if (doc.errors.length > 0 || !doc.contents) return null;

  let node: unknown = doc.contents;
  let found: Range | null = null;
  for (const seg of parsePointer(pointer)) {
    if (isMap(node)) {
      const pair = node.items.find((p) => keyText(p) === seg);
      if (!pair) break;
      found = pairRange(pair) ?? found;
      node = pair.value;
    } else if (isSeq(node)) {
      const item = node.items[Number(seg)] as Node | undefined;
      if (!item) break;
      found = rangeOf(item) ?? found;
      node = item;
    } else break;
  }
  if (!found) return null;
  // The range end is exclusive and may swallow trailing blank lines: back up over whitespace.
  let end = found[1];
  while (end > found[0] && /\s/.test(text[end - 1] ?? '')) end--;
  return { fromLine: lc.linePos(found[0]).line, toLine: lc.linePos(end).line };
}

/**
 * The JSON Pointer of the deepest field at a character offset (a cursor position). A position on
 * a key or anywhere inside a value points at that field. Blank lines and comments between fields
 * point at the enclosing map or list.
 */
export function pointerAtOffset(text: string, offset: number): string | null {
  const doc = parseDocument(text);
  if (doc.errors.length > 0 || !doc.contents) return null;
  const segments: string[] = [];
  let node: unknown = doc.contents;
  for (let depth = 0; depth < 64; depth++) {
    if (isMap(node)) {
      const pair = node.items.find((p) => {
        const r = pairRange(p);
        return r && offset >= r[0] && offset <= r[1];
      });
      if (!pair) break;
      segments.push(keyText(pair));
      const v = rangeOf(pair.value);
      if (!v || offset < v[0] || offset > v[1]) break; // on the key
      node = pair.value;
    } else if (isSeq(node)) {
      const i = node.items.findIndex((item) => {
        const r = rangeOf(item);
        return r && offset >= r[0] && offset <= r[1];
      });
      if (i === -1) break;
      segments.push(String(i));
      node = node.items[i];
    } else break;
  }
  return buildPointer(segments);
}
