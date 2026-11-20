/**
 * Grouping by id. Entry ids are dotted (`ob.s.color.status.info`) or, for tokens, slashed
 * (`Color/Action/Primary`). Entries that share a leading run of segments are shown under one group,
 * so a long flat list becomes something that can be collapsed. Nothing here knows any name: the
 * structure comes only from the ids.
 */

export type IdNode<T> =
  | { type: 'entry'; item: T }
  | {
      type: 'group';
      /** The full path of the group (its segments with their separators), unique in the tree. */
      key: string;
      /** The segments this group adds below its parent, joined as they were written. */
      label: string;
      /** Every item below the group, at any depth. */
      items: T[];
      children: IdNode<T>[];
    };

interface Trie<T> {
  segment: string;
  path: string;
  own: T[];
  children: Map<string, Trie<T>>;
}

/** Split an id into names, each with the separator that followed it (none for the last). */
const segmentsOf = (id: string) =>
  [...id.matchAll(/([^./]+)([./]?)/g)].map((m) => ({ name: m[1] ?? '', sep: m[2] ?? '' }));
const stripSeparator = (s: string) => s.replace(/[./]$/, '');

const node = <T>(segment: string, path: string): Trie<T> => ({
  segment,
  path,
  own: [],
  children: new Map(),
});

function itemsUnder<T>(n: Trie<T>): T[] {
  return [...n.own, ...[...n.children.values()].flatMap(itemsUnder)];
}

function emit<T>(n: Trie<T>): IdNode<T>[] {
  const out: IdNode<T>[] = n.own.map((item) => ({ type: 'entry', item }));
  for (const child of n.children.values()) {
    const items = itemsUnder(child);
    const [only] = items;
    // One entry below here: a group of one would only add a click, so show the entry itself.
    if (items.length === 1 && only !== undefined) {
      out.push({ type: 'entry', item: only });
      continue;
    }
    // Fold single-child levels without an entry of their own into one label.
    let cur = child;
    let label = child.segment;
    while (cur.own.length === 0 && cur.children.size === 1) {
      const [next] = cur.children.values();
      if (!next) break;
      cur = next;
      label += next.segment;
    }
    out.push({
      type: 'group',
      key: cur.path,
      label: stripSeparator(label),
      items,
      children: emit(cur),
    });
  }
  return out;
}

/** Build the groups for `items`, keeping the order in which they came. */
export function buildIdTree<T>(items: readonly T[], idOf: (item: T) => string): IdNode<T>[] {
  const root = node<T>('', '');
  for (const item of items) {
    let cur = root;
    for (const { name, sep } of segmentsOf(idOf(item))) {
      let next = cur.children.get(name);
      if (!next) {
        next = node<T>(name + sep, cur.path + name + sep);
        cur.children.set(name, next);
      }
      cur = next;
    }
    cur.own.push(item);
  }
  return emit(root);
}

/** Whether an entry matches a search: every word appears somewhere in its id, name or kind. */
export function matchesQuery(
  entry: { id: string; name: string | null; kind: string | null },
  query: string,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${entry.id} ${entry.name ?? ''} ${entry.kind ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** The keys of the groups that hold the first item satisfying `match`, outermost first. */
export function pathTo<T>(nodes: IdNode<T>[], match: (item: T) => boolean): string[] | null {
  for (const n of nodes) {
    if (n.type === 'entry') {
      if (match(n.item)) return [];
      continue;
    }
    const inner = pathTo(n.children, match);
    if (inner) return [n.key, ...inner];
  }
  return null;
}
