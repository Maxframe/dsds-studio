import { describe, expect, it } from 'vitest';
import { ancestorLines } from './yaml-ancestors';

const doc = [
  'shared:', // 1
  '  - id: a11y', // 2
  '    sections:', // 3
  '      - kind: guidelines', // 4
  '        items:', // 5
  '', // 6
  '          # note', // 7
  '          - id: label', // 8
  '            level: must', // 9
  '            checks:', // 10
  '              - href: ./x', // 11
  '          - id: other', // 12
  'next: 1', // 13
];

describe('ancestorLines', () => {
  it('returns the chain of less-indented lines, outermost first', () => {
    expect(ancestorLines(doc, 9)).toEqual([1, 3, 5]);
    expect(ancestorLines(doc, 11)).toEqual([1, 3, 5, 10]);
  });

  it('does not count siblings, blank lines or comments', () => {
    expect(ancestorLines(doc, 12)).toEqual([1, 3, 5]);
  });

  it('has no ancestors for a top-level line, and handles blank lines by looking below', () => {
    expect(ancestorLines(doc, 13)).toEqual([]);
    expect(ancestorLines(doc, 1)).toEqual([]);
    expect(ancestorLines(doc, 6)).toEqual([1, 3, 5]);
  });

  it('keeps only the outermost `max` ancestors', () => {
    expect(ancestorLines(doc, 11, 3)).toEqual([1, 3, 5]);
  });
});
