import { effective, kindOptions, type SchemaBundle, type SchemaNode } from './schema';
import type { EditOp } from './types';

/**
 * The order the style guide asks for in three lists (STYLE_GUIDE §1, §4, §5; advisory rules DSDS-21,
 * 18 and 19): a base document's `entries` by kind, an entry's `sections` by kind then framing then
 * audience, and guideline `items` by requirement level. The pack's own lint reads each order from
 * the schema's enums, in the order each declares its values, and so does this: nothing here lists a
 * kind or a level. Only the lists and the fields that name them (`kind`, `framing`, `for`, `level`)
 * come from the style guide.
 */
export type Rank = number[];
export type Ranker = (item: unknown) => Rank;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function compareRank(a: Rank, b: Rank): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Where a new item goes: after the last item that ranks the same or lower, so it joins the end of
 * its group and never jumps ahead of what is already there.
 */
export function insertionIndex<T>(items: readonly T[], rankOf: (item: T) => Rank, item: T): number {
  const rank = rankOf(item);
  const after = items.findIndex((other) => compareRank(rankOf(other), rank) > 0);
  return after === -1 ? items.length : after;
}

/** A value's place among a schema enum's values. A missing value ranks as the enum's default; a value the enum does not list (a custom kind) ranks last. */
const enumRank = (values: readonly unknown[], fallback: unknown) => (value: unknown) => {
  const v = value === undefined || value === null ? fallback : value;
  const i = values.indexOf(v);
  return i === -1 ? values.length : i;
};

/** The values and default a field's schema declares, or null when it declares no enum. */
function enumOf(
  bundle: SchemaBundle,
  node: SchemaNode,
  key: string,
  seed: unknown,
): { values: unknown[]; fallback: unknown } | null {
  const prop = effective(bundle, node, seed).properties.find((p) => p.key === key);
  if (!prop) return null;
  const e = effective(bundle, prop.node, undefined);
  const values = [...(e.enum ?? []), ...(e.suggestions ?? [])];
  return values.length > 0 ? { values, fallback: e.default } : null;
}

/**
 * A ranker for one of the three ordered lists, or null for any other list (the style guide says to
 * keep the order you wrote where no rule decides). `list` is the field the list sits under.
 */
export function listRanker(
  bundle: SchemaBundle,
  list: string,
  itemNode: SchemaNode,
): Ranker | null {
  if (list === 'entries') {
    const kinds = kindOptions(bundle, itemNode);
    if (kinds.length === 0) return null;
    const fallback = enumOf(bundle, itemNode, 'kind', {})?.fallback ?? 'entry';
    const kind = enumRank(kinds, fallback);
    return (item) => [kind(isRecord(item) ? item.kind : undefined)];
  }
  if (list === 'sections') {
    const kinds = kindOptions(bundle, itemNode);
    if (kinds.length === 0) return null;
    const kindDefault = enumOf(bundle, itemNode, 'kind', {})?.fallback;
    const kind = enumRank(kinds, kindDefault);
    return (item) => {
      const o = isRecord(item) ? item : {};
      const k = o.kind ?? kindDefault;
      // Framing and audience only order the kind that has a framing (guidelines). For the others
      // the lint checks grouping alone, so two sections of one kind keep the order you wrote.
      const framing = enumOf(bundle, itemNode, 'framing', { kind: k });
      const audience = framing ? enumOf(bundle, itemNode, 'for', { kind: k }) : null;
      return [
        kind(o.kind),
        framing ? enumRank(framing.values, framing.fallback)(o.framing) : 0,
        audience ? enumRank(audience.values, audience.fallback)(o.for) : 0,
      ];
    };
  }
  if (list === 'items') {
    // Only a list whose items carry a requirement level (a guidelines section's items).
    const level = enumOf(bundle, itemNode, 'level', { statement: '' });
    if (!level) return null;
    const rank = enumRank(level.values, level.fallback);
    return (item) => [rank(isRecord(item) ? item.level : undefined)];
  }
  return null;
}

/**
 * The edits that add `value` to a list: an append, then a move into place when the list has an
 * order and the item does not belong last. `index` is where it ends up.
 */
export function insertOps(
  pointer: string,
  items: readonly unknown[],
  value: unknown,
  rank: Ranker | null,
): { ops: EditOp[]; index: number } {
  const index = rank ? insertionIndex(items, rank, value) : items.length;
  const ops: EditOp[] = [{ op: 'append', pointer, value }];
  if (index < items.length) ops.push({ op: 'move', pointer, from: items.length, to: index });
  return { ops, index };
}

/**
 * The moves that put a list in order, keeping items of equal rank in the order they had. Null when
 * it already is. Each move takes the item at `from` out and puts it back at `to`, one after another.
 */
export function sortMoves(
  items: readonly unknown[],
  rank: Ranker,
): Array<{ from: number; to: number }> | null {
  const target = items
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => compareRank(a.r, b.r) || a.i - b.i);
  const current = items.map((_, i) => i);
  const moves: Array<{ from: number; to: number }> = [];
  target.forEach((t, to) => {
    const from = current.indexOf(t.i);
    if (from === to) return;
    moves.push({ from, to });
    current.splice(to, 0, ...current.splice(from, 1));
  });
  return moves.length > 0 ? moves : null;
}
