import { describe, expect, it } from 'vitest';
import { linkAt, linkInYaml, suggestTargets } from './dsds-links';

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

describe('linkAt: the scheme is case-insensitive (Processing §2.4)', () => {
  it('finds a link written with a capitalised scheme, and keeps what was typed after it', () => {
    expect(linkAt('Use <DSDS:But', 13)).toEqual({ from: 10, query: 'But' });
    expect(linkAt('See [it](Dsds:button#an', 23)).toEqual({ from: 14, query: 'button#an' });
  });
});

describe('linkAt: nothing is offered inside code (Processing §2.4)', () => {
  const at = (text: string) => linkAt(text.replace('|', ''), text.indexOf('|'));
  // The link starts `query.length` before the caret, whatever the text before it.
  const found = (text: string, query: string) => ({
    from: text.indexOf('|') - query.length,
    query,
  });

  it('is null inside an inline code span, closed after the caret or before it', () => {
    expect(at('Write `<dsds:but|` to link')).toBeNull();
    expect(at('Write `a <dsds:but|` and `b`')).toBeNull();
  });

  it('offers again once the span has closed', () => {
    expect(at('Write `code` then <dsds:but|')).toEqual(
      found('Write `code` then <dsds:but|', 'but'),
    );
  });

  it('matches a span by the length of its backtick run', () => {
    expect(at('``a ` b <dsds:x|`` end')).toBeNull();
    expect(at('``a ` b`` <dsds:x|')).toEqual(found('``a ` b`` <dsds:x|', 'x'));
  });

  it('treats a backtick with no closing partner as plain text', () => {
    expect(at('a ` b <dsds:x|')).toEqual(found('a ` b <dsds:x|', 'x'));
  });

  it('treats an escaped backtick as plain text, not the start of a span', () => {
    expect(at('a \\` b <dsds:x|')).toEqual(found('a \\` b <dsds:x|', 'x'));
  });

  it('does not let a span run across a blank line', () => {
    expect(at('`a\n\n<dsds:b|`')).toEqual(found('`a\n\n<dsds:b|`', 'b'));
  });

  it('is null inside a fenced code block, with backticks or tildes', () => {
    expect(at('Intro\n```\n<dsds:but|\n```\n')).toBeNull();
    expect(at('Intro\n~~~js\n<dsds:but|\n~~~\n')).toBeNull();
  });

  it('offers again after the fence closes', () => {
    expect(at('```\ncode\n```\nSee <dsds:but|')).toEqual(
      found('```\ncode\n```\nSee <dsds:but|', 'but'),
    );
  });

  it('keeps a fence open until one at least as long closes it, and to the end if none does', () => {
    expect(at('````\n```\n<dsds:x|\n```\n')).toBeNull();
    expect(at('```\n<dsds:x|')).toBeNull();
  });

  it('ignores backticks in the link text before an earlier span, as CommonMark does', () => {
    expect(at('`a` and `b` <dsds:x|')).toEqual(found('`a` and `b` <dsds:x|', 'x'));
  });
});

describe('linkInYaml: a link typed in the YAML view', () => {
  // `^` marks the caret; `|` in the text is YAML's own block scalar indicator.
  const at = (text: string) => {
    const caret = text.indexOf('^');
    return { link: linkInYaml(text.replace('^', ''), caret), caret };
  };

  it('finds a link in a one-line value, by position in the whole document', () => {
    const { link, caret } = at('name: x\ndescription: See <dsds:but^\nother: y\n');
    expect(link).toEqual({ from: caret - 3, query: 'but' });
  });

  it('finds a link in a block scalar, and not in a fence inside it', () => {
    const open = at('description: |\n  Intro <dsds:but^\n  more\n');
    expect(open.link).toEqual({ from: open.caret - 3, query: 'but' });
    const fenced = at('description: |\n  Intro\n  ```\n  <dsds:but^\n  ```\n');
    expect(fenced.link).toBeNull();
  });

  it('finds a link after a fence in a block scalar has closed', () => {
    const { link } = at('description: |\n  ```\n  code\n  ```\n  See <dsds:but^\n');
    expect(link?.query).toBe('but');
  });

  it('is null inside a code span on one line', () => {
    expect(at('description: Use `<dsds:but^` here\n').link).toBeNull();
  });

  it('is not confused by backticks on another key', () => {
    const { link } = at('example: ```\ndescription: See <dsds:but^\n');
    expect(link?.query).toBe('but');
  });

  it('does not look past the block into the next key', () => {
    const { link } = at('a: |\n  ```\nb: |\n  See <dsds:but^\n');
    expect(link?.query).toBe('but');
  });

  it('is null away from a link', () => {
    expect(at('name: pl^ain\n').link).toBeNull();
  });

  it('accepts a capitalised scheme', () => {
    expect(at('description: See <DSDS:but^\n').link?.query).toBe('but');
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
