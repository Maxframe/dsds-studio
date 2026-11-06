import { describe, expect, it } from 'vitest';
import { linkAt, suggestTargets } from './dsds-links';

const targets = [
  { target: 'button', label: 'Button' },
  { target: 'button#anatomy', label: 'anatomy' },
  { target: 'icon-button', label: 'Icon Button' },
  { target: 'dialog', label: 'Dialog' },
];

describe('linkAt', () => {
  it('finds an open angle-bracket link at the caret', () => {
    const text = 'Use <dsds:but';
    expect(linkAt(text, text.length)).toEqual({ from: 10, query: 'but' });
  });
  it('finds an open markdown link target', () => {
    const text = 'See [it](dsds:button#an';
    expect(linkAt(text, text.length)).toEqual({ from: 14, query: 'button#an' });
  });
  it('works with an empty query right after the scheme', () => {
    expect(linkAt('x <dsds:', 8)).toEqual({ from: 8, query: '' });
  });
  it('looks only before the caret', () => {
    expect(linkAt('<dsds:button> and more', 9)).toEqual({ from: 6, query: 'but' });
  });
  it('is null outside a link or once the link is closed', () => {
    expect(linkAt('plain text', 5)).toBeNull();
    expect(linkAt('<dsds:button> after', 19)).toBeNull();
    expect(linkAt('dsds:button without bracket', 11)).toBeNull();
  });
});

describe('suggestTargets', () => {
  it('lists everything for an empty query', () => {
    expect(suggestTargets(targets, '')).toHaveLength(4);
  });
  it('ranks prefix matches before substring matches, ignoring case', () => {
    expect(suggestTargets(targets, 'BUT').map((t) => t.target)).toEqual([
      'button',
      'button#anatomy',
      'icon-button',
    ]);
  });
  it('matches the label too', () => {
    expect(suggestTargets(targets, 'anat').map((t) => t.target)).toEqual(['button#anatomy']);
  });
  it('honours the limit', () => {
    expect(suggestTargets(targets, '', 2)).toHaveLength(2);
  });
});
