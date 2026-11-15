import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SchemaBundle,
  effective,
  nodeOf,
  propertyOf,
  type JsonSchema,
  type SchemaNode,
} from '@shared/schema';
import { insertionIndex, insertOps, listRanker, sortMoves } from '@shared/order';
import { packDir } from './helpers';

const bundle = new SchemaBundle(
  JSON.parse(
    readFileSync(join(packDir(), 'schema/dsds.bundled.schema.json'), 'utf8'),
  ) as JsonSchema,
);
const doc = effective(bundle, nodeOf(bundle.documentFragment()), {});
const entryItems = propertyOf(bundle, doc, 'entries', {})!.items!;
const component = effective(bundle, entryItems, { kind: 'component' });
const sectionItems = propertyOf(bundle, component, 'sections', [])!.items!;
const guidelines = effective(bundle, sectionItems, { kind: 'guidelines', for: 'all' });
const guidelineItems = propertyOf(bundle, guidelines, 'items', [])!.items!;
const traitItems = propertyOf(bundle, component, 'traits', [])!.items!;

const ranker = (list: string, node: SchemaNode) => {
  const r = listRanker(bundle, list, node);
  if (!r) throw new Error(`no ranker for ${list}`);
  return r;
};
const indexIn = (list: string, node: SchemaNode, items: unknown[], item: unknown) =>
  insertionIndex(items, ranker(list, node), item);

describe('insertionIndex', () => {
  const byNumber = (n: number) => [n];
  it('goes after the last item that ranks the same or lower', () => {
    expect(insertionIndex([1, 2, 2, 4], byNumber, 2)).toBe(3);
    expect(insertionIndex([1, 2, 2, 4], byNumber, 3)).toBe(3);
  });

  it('goes first before anything that ranks higher, and last after everything', () => {
    expect(insertionIndex([2, 3], byNumber, 1)).toBe(0);
    expect(insertionIndex([2, 3], byNumber, 9)).toBe(2);
    expect(insertionIndex([], byNumber, 1)).toBe(0);
  });

  it('compares ranks of several parts left to right', () => {
    const pair = (p: [number, number]) => p;
    expect(
      insertionIndex(
        [
          [0, 1],
          [1, 0],
        ] as Array<[number, number]>,
        pair,
        [0, 2],
      ),
    ).toBe(1);
  });
});

describe('entries: by kind, in the order the schema lists the kinds', () => {
  const kinds = (...k: Array<string | undefined>) => k.map((kind) => ({ kind }));
  it('places a new kind after what it is built on and before what builds on it', () => {
    const items = kinds('system', 'token', 'component', 'entry');
    expect(indexIn('entries', entryItems, items, { kind: 'theme' })).toBe(2);
    expect(indexIn('entries', entryItems, items, { kind: 'token' })).toBe(2);
    expect(indexIn('entries', entryItems, items, { kind: 'system' })).toBe(1);
  });

  it('puts a custom kind last, and treats a missing kind as the schema default', () => {
    const items = kinds('system', 'component', 'entry');
    expect(indexIn('entries', entryItems, items, { kind: 'acme.icons' })).toBe(3);
    // A missing `kind` reads as `entry`, which ranks after components.
    expect(indexIn('entries', entryItems, kinds('system', 'entry'), { kind: 'component' })).toBe(1);
    expect(indexIn('entries', entryItems, kinds('system', undefined), { kind: 'component' })).toBe(
      1,
    );
  });

  it('keeps an entry added to a kind after the ones already there', () => {
    const items = kinds('system', 'component', 'component', 'entry');
    expect(indexIn('entries', entryItems, items, { kind: 'component' })).toBe(3);
  });
});

describe('sections: by kind, then framing, then audience (guidelines only)', () => {
  const s = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, ...extra });
  it('groups the same kind together, general to specific', () => {
    const items = [s('guidelines', { for: 'all' }), s('steps', { for: 'all' })];
    expect(indexIn('sections', sectionItems, items, s('definitions', { for: 'all' }))).toBe(1);
    expect(indexIn('sections', sectionItems, items, s('section', { for: 'all' }))).toBe(2);
    expect(indexIn('sections', sectionItems, items, s('guidelines', { for: 'all' }))).toBe(1);
  });

  it('puts a when-to-use guidelines section before how-to-use ones', () => {
    const items = [s('guidelines', { for: 'all' }), s('steps', { for: 'all' })];
    const when = s('guidelines', { for: 'all', framing: 'when-to-use' });
    expect(indexIn('sections', sectionItems, items, when)).toBe(0);
  });

  it('treats a missing framing and audience as their schema defaults', () => {
    // No `framing` reads as how-to-use, no `for` as all.
    const items = [s('guidelines'), s('steps')];
    expect(
      indexIn('sections', sectionItems, items, s('guidelines', { framing: 'when-to-use' })),
    ).toBe(0);
    expect(indexIn('sections', sectionItems, items, s('guidelines', { for: 'agent' }))).toBe(1);
  });

  it('orders audience within one framing tier: all, human, agent', () => {
    const items = [
      s('guidelines', { for: 'all' }),
      s('guidelines', { for: 'agent' }),
      s('steps', { for: 'all' }),
    ];
    expect(indexIn('sections', sectionItems, items, s('guidelines', { for: 'human' }))).toBe(1);
  });

  it('does not compare audience for other kinds: the order you wrote stays', () => {
    const items = [s('definitions', { for: 'agent' })];
    expect(indexIn('sections', sectionItems, items, s('definitions', { for: 'all' }))).toBe(1);
  });
});

describe('guideline items: by requirement level', () => {
  const items = (...levels: Array<string | undefined>) => levels.map((level) => ({ level }));
  it('ranks levels in the order the schema lists them', () => {
    const rank = ranker('items', guidelineItems);
    const order = ['must', 'should', 'may', 'should-not', 'must-not'];
    expect(order.map((level) => rank({ level }))).toEqual([[0], [1], [2], [3], [4]]);
  });

  it('sorts out-of-order items, keeping equal levels in the order they had', () => {
    const list = [
      { level: 'should', n: 1 },
      { level: 'must', n: 2 },
      { level: 'should', n: 3 },
      { level: 'must', n: 4 },
    ];
    const moves = sortMoves(list, ranker('items', guidelineItems))!;
    const sorted = [...list];
    for (const m of moves) sorted.splice(m.to, 0, ...sorted.splice(m.from, 1));
    expect(sorted.map((i) => i.n)).toEqual([2, 4, 1, 3]);
  });

  it('has nothing to do for items already in order', () => {
    expect(
      sortMoves(items('must', 'should', 'should', 'may'), ranker('items', guidelineItems)),
    ).toBeNull();
  });
});

describe('lists the style guide does not order', () => {
  it('has no ranker for traits, or for items that carry no level', () => {
    expect(listRanker(bundle, 'traits', traitItems)).toBeNull();
    const definitions = effective(bundle, sectionItems, { kind: 'definitions', for: 'all' });
    const defItems = propertyOf(bundle, definitions, 'items', [])!.items!;
    expect(listRanker(bundle, 'items', defItems)).toBeNull();
    expect(listRanker(bundle, 'tags', traitItems)).toBeNull();
  });
});

describe('insertOps', () => {
  it('appends when the item belongs last, or appends then moves it into place', () => {
    const rank = ranker('entries', entryItems);
    const list = [{ kind: 'system' }, { kind: 'component' }];
    expect(insertOps('/entries', list, { kind: 'entry' }, rank)).toEqual({
      index: 2,
      ops: [{ op: 'append', pointer: '/entries', value: { kind: 'entry' } }],
    });
    expect(insertOps('/entries', list, { kind: 'token' }, rank)).toEqual({
      index: 1,
      ops: [
        { op: 'append', pointer: '/entries', value: { kind: 'token' } },
        { op: 'move', pointer: '/entries', from: 2, to: 1 },
      ],
    });
  });

  it('just appends when the list has no order', () => {
    expect(insertOps('/x', [1, 2], 3, null)).toEqual({
      index: 2,
      ops: [{ op: 'append', pointer: '/x', value: 3 }],
    });
  });
});
