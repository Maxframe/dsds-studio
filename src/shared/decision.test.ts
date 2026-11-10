import { describe, expect, it } from 'vitest';
import { decisionTemplate, nextDecisionId } from './decision';

describe('nextDecisionId', () => {
  it('starts at 0001 and slugs the title', () => {
    expect(nextDecisionId([], 'Use tokens for spacing')).toBe('adr-0001-use-tokens-for-spacing');
  });

  it('continues after the highest existing number, even with gaps', () => {
    const ids = ['adr-0003-a', 'adr-0012-b', 'button', 'adr-xyz', 'adr-7'];
    expect(nextDecisionId(ids, 'Next')).toBe('adr-0013-next');
  });

  it('falls back to a plain word for a title with no letters or digits', () => {
    expect(nextDecisionId([], '  !!! ')).toBe('adr-0001-decision');
  });

  it('keeps long titles to a usable id length', () => {
    const id = nextDecisionId([], 'word '.repeat(40));
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id.endsWith('-')).toBe(false);
  });
});

describe('decisionTemplate', () => {
  const entry = decisionTemplate('adr-0001-x', 'Use X', '2026-11-11');

  it('is a generic entry tagged decision, proposed, dated', () => {
    expect(entry).toMatchObject({
      kind: 'entry',
      id: 'adr-0001-x',
      name: 'Use X',
      metadata: {
        status: { status: 'proposed' },
        tags: ['decision'],
        updated: { date: '2026-11-11' },
      },
    });
  });

  it('has the four ADR headings as one headed section', () => {
    const [section, ...rest] = entry.sections;
    expect(rest).toEqual([]);
    expect(section).toMatchObject({ kind: 'section', for: 'all' });
    expect(section?.freeform.map((f) => f.title)).toEqual([
      'Context',
      'Decision',
      'Consequences',
      'Alternatives considered',
    ]);
  });
});
