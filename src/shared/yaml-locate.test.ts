import { describe, expect, it } from 'vitest';
import { locatePointer, pointerAtOffset } from './yaml-locate';

const text = `schemaVersion: "0.23.1"
name: Acme
entries:
  - kind: component
    id: button
    name: Button
    description: >-
      A button that
      spans lines.
    sections:
      - kind: steps
        for: all
        items:
          - title: Do it

  - kind: token
    id: color
`;
const lineOf = (needle: string) => text.slice(0, text.indexOf(needle)).split('\n').length;

describe('locatePointer', () => {
  it('finds a scalar field on its line', () => {
    expect(locatePointer(text, '/entries/0/id')).toEqual({
      fromLine: lineOf('id: button'),
      toLine: lineOf('id: button'),
    });
  });
  it('covers a multi-line value', () => {
    const r = locatePointer(text, '/entries/0/description')!;
    expect(r.fromLine).toBe(lineOf('description:'));
    expect(r.toLine).toBe(lineOf('spans lines.'));
  });
  it('covers a whole list item, without trailing blank lines', () => {
    const r = locatePointer(text, '/entries/0')!;
    expect(r.fromLine).toBe(lineOf('- kind: component'));
    expect(r.toLine).toBe(lineOf('- title: Do it'));
  });
  it('falls back to the nearest existing ancestor for a missing field', () => {
    expect(locatePointer(text, '/entries/1/metadata/status')).toEqual(
      locatePointer(text, '/entries/1'),
    );
  });
  it('is null for the root and for unparsable text', () => {
    expect(locatePointer(text, '')).toBeNull();
    expect(locatePointer('a: [x', '/a')).toBeNull();
  });
  it('works on JSON', () => {
    expect(locatePointer('{\n  "a": {\n    "b": 1\n  }\n}\n', '/a/b')).toEqual({
      fromLine: 3,
      toLine: 3,
    });
  });
});

describe('pointerAtOffset', () => {
  const at = (needle: string, extra = 0) => pointerAtOffset(text, text.indexOf(needle) + extra);
  it('gives the field under the cursor, on the key or in the value', () => {
    expect(at('id: button')).toBe('/entries/0/id');
    expect(at('button', 0)).toBe('/entries/0/id');
    expect(at('spans lines.', 3)).toBe('/entries/0/description');
  });
  it('descends into nested lists', () => {
    expect(at('title: Do it', 3)).toBe('/entries/0/sections/0/items/0/title');
  });
  it('points at the enclosing item on a blank line', () => {
    const blank = text.indexOf('\n\n') + 1;
    expect(pointerAtOffset(text, blank)).toMatch(/^\/entries/);
  });
  it('round-trips with locatePointer', () => {
    const p = at('for: all', 2)!;
    const r = locatePointer(text, p)!;
    expect(r.fromLine).toBe(lineOf('for: all'));
  });
});
