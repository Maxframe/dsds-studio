import { describe, expect, it } from 'vitest';
import { fileNameForId } from './filename';

describe('fileNameForId', () => {
  it('keeps a plain id', () => {
    expect(fileNameForId('button-copy')).toBe('button-copy');
  });

  it('flattens the slashes of a token id into one file name, not folders', () => {
    expect(fileNameForId('color/action/primary-copy')).toBe('color-action-primary-copy');
  });

  it('keeps dots and underscores, and replaces anything else unsafe', () => {
    expect(fileNameForId('space.4_x')).toBe('space.4_x');
    expect(fileNameForId('a b$c#d')).toBe('a-b-c-d');
  });

  it('never returns an empty name or one that starts or ends with a dash or dot', () => {
    expect(fileNameForId('///')).toBe('entry');
    expect(fileNameForId('-.a.-')).toBe('a');
  });
});
