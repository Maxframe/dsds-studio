import { describe, expect, it } from 'vitest';
import { buildPointer, parsePointer } from './pointer';

describe('json pointer', () => {
  it('round-trips escaped segments', () => {
    const segs = ['$extensions', 'com.acme/x', 'a~b', '0'];
    expect(parsePointer(buildPointer(segs))).toEqual(segs);
  });
  it('treats "" as the root', () => {
    expect(parsePointer('')).toEqual([]);
  });
  it('rejects a pointer without a leading slash', () => {
    expect(() => parsePointer('a/b')).toThrow();
  });
});
