import { escapePointerSegment, parsePointer } from './pointer';
import type { EntrySummary } from './types';

/**
 * The string values held by the fields that sit where `pointer` does, across the whole document.
 * A list position in the pointer (`/entries/3/kind`) stands for any position, so this finds what
 * every other entry's `kind` is. Object keys are matched exactly. The field at `pointer` itself is
 * left out, so a value counts only if something else uses it. Pure: no schema knowledge.
 */
export function valuesLikeField(root: unknown, pointer: string): Map<string, number> {
  const segments = parsePointer(pointer);
  const counts = new Map<string, number>();

  const walk = (node: unknown, i: number, path: string): void => {
    if (i === segments.length) {
      if (typeof node === 'string' && path !== pointer)
        counts.set(node, (counts.get(node) ?? 0) + 1);
      return;
    }
    const seg = segments[i] as string;
    if (Array.isArray(node) && /^\d+$/.test(seg)) {
      node.forEach((item, index) => walk(item, i + 1, `${path}/${index}`));
    } else if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      const next = (node as Record<string, unknown>)[seg];
      if (next !== undefined) walk(next, i + 1, `${path}/${escapePointerSegment(seg)}`);
    }
  };
  walk(root, 0, '');
  return counts;
}

/**
 * What other fields like the one at `pointer` hold. For an entry's own `kind` that is every other
 * entry in the project, in any file (so a kind used only in another file still shows up). For any
 * other field it is the open document.
 */
export function fieldUsage(
  root: unknown,
  pointer: string,
  file: string,
  entries: EntrySummary[],
): Map<string, number> {
  const self = entries.find((e) => e.file === file && pointer === `${e.pointer}/kind`);
  if (!self) return valuesLikeField(root, pointer);
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e === self || !e.kind) continue;
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  }
  return counts;
}
