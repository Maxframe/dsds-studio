import { describe, expect, it } from 'vitest';
import { normalizePlatforms, parsePlatforms } from './platforms';

describe('parsePlatforms', () => {
  it('splits on commas, semicolons and new lines, and makes each name a valid id', () => {
    expect(parsePlatforms('React Native, iOS; Web-Component\nAndroid')).toEqual([
      'react-native',
      'ios',
      'web-component',
      'android',
    ]);
  });

  it('keeps a space inside a name as part of the name, not as a separator', () => {
    expect(parsePlatforms('react native')).toEqual(['react-native']);
  });

  it('drops empty parts and repeats, keeping the first of each', () => {
    expect(parsePlatforms(' react, , ios, React ,')).toEqual(['react', 'ios']);
  });

  it('gives nothing for text with no letters or digits', () => {
    expect(parsePlatforms('')).toEqual([]);
    expect(parsePlatforms(' ,; !!! ')).toEqual([]);
  });
});

describe('normalizePlatforms', () => {
  it('applies the same rules to a list', () => {
    expect(normalizePlatforms(['React', 'react', ' iOS ', '??'])).toEqual(['react', 'ios']);
  });
});
