import { describe, expect, it } from 'vitest';
import { buildIdTree, matchesQuery, type IdNode } from '@shared/idTree';

const ids = (xs: string[]) => xs.map((id) => ({ id }));
const idOf = (x: { id: string }) => x.id;
const tree = (xs: string[]) => buildIdTree(ids(xs), idOf);

/** A readable outline: groups as "label (n)" with their children indented, entries by id. */
function outline(nodes: IdNode<{ id: string }>[], depth = 0): string[] {
  return nodes.flatMap((n) =>
    n.type === 'entry'
      ? [`${'  '.repeat(depth)}${n.item.id}`]
      : [`${'  '.repeat(depth)}${n.label} (${n.items.length})`, ...outline(n.children, depth + 1)],
  );
}

describe('buildIdTree', () => {
  it('groups entries that share an id prefix and keeps document order', () => {
    expect(
      outline(
        tree([
          'ob.s.color.status.info',
          'ob.s.color.status.critical',
          'ob.s.color.neutral.bg',
          'ob.s.color.neutral.fg',
        ]),
      ),
    ).toEqual([
      'ob.s.color (4)',
      '  status (2)',
      '    ob.s.color.status.info',
      '    ob.s.color.status.critical',
      '  neutral (2)',
      '    ob.s.color.neutral.bg',
      '    ob.s.color.neutral.fg',
    ]);
  });

  it('folds a chain of single-child levels into one group label', () => {
    const [group] = tree(['a.b.c.d.x', 'a.b.c.d.y']);
    expect(group).toMatchObject({ type: 'group', label: 'a.b.c.d', key: 'a.b.c.d.' });
  });

  it('shows a lone entry as a plain row, with no group of its own', () => {
    expect(outline(tree(['ob.g.a.one', 'ob.g.a.two', 'other.thing.deep']))).toEqual([
      'ob.g.a (2)',
      '  ob.g.a.one',
      '  ob.g.a.two',
      'other.thing.deep',
    ]);
  });

  it('keeps an entry that is also the parent of others inside its own group', () => {
    expect(outline(tree(['color.blue', 'color.blue.50', 'color.blue.100']))).toEqual([
      'color.blue (3)',
      '  color.blue',
      '  color.blue.50',
      '  color.blue.100',
    ]);
  });

  it('splits on slashes as well, and keeps the separator the id used', () => {
    const [group] = tree(['Color/Action/Primary', 'Color/Action/Hover']);
    expect(group).toMatchObject({ type: 'group', label: 'Color/Action' });
  });

  it('puts ids without structure in a flat list', () => {
    expect(outline(tree(['btn1', 'btn2', 'card']))).toEqual(['btn1', 'btn2', 'card']);
  });

  it('keeps every item exactly once', () => {
    const xs = ['a.b.c', 'a.b.d', 'a.e', 'f', 'a.b.c.x'];
    const seen = (nodes: IdNode<{ id: string }>[]): string[] =>
      nodes.flatMap((n) => (n.type === 'entry' ? [n.item.id] : seen(n.children)));
    expect(seen(tree(xs)).sort()).toEqual([...xs].sort());
  });
});

describe('matchesQuery', () => {
  const e = { id: 'ob.s.color.status.info', name: 'Status info', kind: 'token' };
  it('matches every word anywhere in the id, name or kind, ignoring case', () => {
    expect(matchesQuery(e, 'STATUS info')).toBe(true);
    expect(matchesQuery(e, 'color token')).toBe(true);
    expect(matchesQuery(e, 'status critical')).toBe(false);
  });
  it('matches everything for an empty query', () => {
    expect(matchesQuery(e, '   ')).toBe(true);
  });
  it('copes with a missing name or kind', () => {
    expect(matchesQuery({ id: 'x', name: null, kind: null }, 'x')).toBe(true);
  });
});
