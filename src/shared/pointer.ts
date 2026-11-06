/** RFC 6901 JSON Pointer helpers. Pure: usable on server and web. */

export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: "${pointer}"`);
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function buildPointer(segments: Array<string | number>): string {
  return segments.map((s) => `/${escapePointerSegment(String(s))}`).join('');
}

/** Read the value at a JSON Pointer from a plain JS value. Undefined when absent. */
export function getAtPointer(value: unknown, pointer: string): unknown {
  let node = value;
  for (const seg of parsePointer(pointer)) {
    if (Array.isArray(node)) node = node[Number(seg)];
    else if (typeof node === 'object' && node !== null)
      node = (node as Record<string, unknown>)[seg];
    else return undefined;
  }
  return node;
}
