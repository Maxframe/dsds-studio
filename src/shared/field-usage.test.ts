import { describe, expect, it } from 'vitest';
import { fieldUsage, valuesLikeField } from './field-usage';
import type { EntrySummary } from './types';

const doc = {
  entries: [
    { kind: 'system', sections: [{ kind: 'guidelines' }, { kind: 'acme.notes' }] },
    { kind: 'component', sections: [{ kind: 'guidelines' }] },
    { kind: 'component', sections: [] },
  ],
};

describe('valuesLikeField', () => {
  it('counts the values every sibling of the field holds, leaving the field itself out', () => {
    expect([...valuesLikeField(doc, '/entries/0/kind')]).toEqual([['component', 2]]);
    expect([...valuesLikeField(doc, '/entries/1/kind')]).toEqual([
      ['system', 1],
      ['component', 1],
    ]);
  });

  it('matches through nested lists', () => {
    const used = valuesLikeField(doc, '/entries/0/sections/0/kind');
    expect(Object.fromEntries(used)).toEqual({ 'acme.notes': 1, guidelines: 1 });
  });

  it('reads a field at the document root', () => {
    expect([...valuesLikeField({ kind: 'component' }, '/kind')]).toEqual([]);
  });

  it('ignores missing paths and non-string values', () => {
    const odd = { entries: [{ kind: 1 }, { kind: 'a' }, null, { other: 'x' }] };
    expect([...valuesLikeField(odd, '/entries/0/kind')]).toEqual([['a', 1]]);
    expect([...valuesLikeField(undefined, '/entries/0/kind')]).toEqual([]);
  });

  it('keeps object keys as they are, so only list positions are wildcards', () => {
    const d = { a: { kind: 'x' }, b: { kind: 'y' } };
    expect([...valuesLikeField(d, '/a/kind')]).toEqual([]);
  });
});

describe('fieldUsage', () => {
  const entry = (id: string, kind: string | null, file: string, pointer: string): EntrySummary => ({
    id,
    kind,
    name: id,
    file,
    pointer,
    origin: pointer === '' ? 'standalone' : 'entries',
  });
  const entries = [
    entry('a', 'system', 'base.yaml', '/entries/0'),
    entry('b', 'component', 'base.yaml', '/entries/1'),
    entry('c', 'acme.widget', 'entries/c.yaml', ''),
    entry('d', null, 'entries/d.yaml', ''),
  ];

  it("uses every other entry in the project for an entry's own kind, across files", () => {
    const used = fieldUsage(doc, '/entries/1/kind', 'base.yaml', entries);
    expect(Object.fromEntries(used)).toEqual({ system: 1, 'acme.widget': 1 });
  });

  it('works for a standalone entry file', () => {
    const used = fieldUsage({}, '/kind', 'entries/c.yaml', entries);
    expect(Object.fromEntries(used)).toEqual({ system: 1, component: 1 });
  });

  it('reads the open document for any other field', () => {
    const used = fieldUsage(doc, '/entries/0/sections/0/kind', 'base.yaml', entries);
    expect(Object.fromEntries(used)).toEqual({ 'acme.notes': 1, guidelines: 1 });
  });
});
