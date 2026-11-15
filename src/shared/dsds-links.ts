import type { RefTarget } from './types';

/** An unfinished `dsds:` link the caret is inside: where its target starts and what is typed. */
export interface OpenLink {
  from: number;
  query: string;
}

// `<dsds:…` or `](dsds:…` / `(dsds:…`, with no whitespace or closing character typed yet. The scheme
// is case-insensitive (Processing §2.4).
const OPEN_LINK = /[(<]dsds:([^\s)>\]"']*)$/i;

/**
 * Where code starts and ends in Markdown, as [from, to) ranges: fenced code blocks and inline code
 * spans. A link written inside code is not a link (Processing §2.4), so nothing is offered there.
 * A fence runs to the end when it never closes, a backtick run with no partner is plain text, and a
 * span cannot cross a blank line or contain an escaped backtick opener.
 */
function codeRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const lines = text.split('\n');
  let offset = 0;
  let fence: { char: string; length: number; from: number } | null = null;
  // The paragraph being collected: where it starts (-1 for none) and where its last line ends.
  let paragraphFrom = -1;
  let paragraphEnd = 0;
  const endParagraph = () => {
    if (paragraphFrom !== -1) {
      ranges.push(...spansIn(text.slice(paragraphFrom, paragraphEnd), paragraphFrom));
    }
    paragraphFrom = -1;
  };
  for (const line of lines) {
    const end = offset + line.length;
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1];
      if (close && close[0] === fence.char && close.length >= fence.length) {
        ranges.push([fence.from, end]);
        fence = null;
      }
    } else {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      const marks = open?.[1];
      if (marks && !(marks[0] === '`' && (open?.[2] ?? '').includes('`'))) {
        endParagraph();
        fence = { char: marks[0] as string, length: marks.length, from: offset };
      } else if (line.trim() === '') {
        endParagraph();
      } else {
        if (paragraphFrom === -1) paragraphFrom = offset;
        paragraphEnd = end;
      }
    }
    offset = end + 1;
  }
  // A fence that never closes runs to the end of the text, including the position after the last character.
  if (fence) ranges.push([fence.from, text.length + 1]);
  endParagraph();
  return ranges;
}

/** Inline code spans in one paragraph: a backtick run closes at the next run of the same length. */
function spansIn(paragraph: string, from: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let i = 0;
  while (i < paragraph.length) {
    const c = paragraph[i];
    if (c === '\\') {
      i += 2;
    } else if (c === '`') {
      let n = 1;
      while (paragraph[i + n] === '`') n++;
      let j = i + n;
      let closeAt = -1;
      while (j < paragraph.length) {
        if (paragraph[j] !== '`') {
          j++;
          continue;
        }
        let m = 1;
        while (paragraph[j + m] === '`') m++;
        if (m === n) {
          closeAt = j;
          break;
        }
        j += m;
      }
      if (closeAt === -1) {
        i += n;
      } else {
        spans.push([from + i, from + closeAt + n]);
        i = closeAt + n;
      }
    } else {
      i++;
    }
  }
  return spans;
}

/**
 * The open `dsds:` link ending at `caret`, or null. Only the text before the caret counts for the
 * link itself; the whole text decides whether the caret is inside code, where nothing is offered.
 */
export function linkAt(text: string, caret: number): OpenLink | null {
  const m = OPEN_LINK.exec(text.slice(0, caret));
  if (!m) return null;
  if (codeRanges(text).some(([from, to]) => from < caret && caret < to)) return null;
  const query = m[1] ?? '';
  return { from: caret - query.length, query };
}

const leadingSpaces = (line: string) => line.length - line.trimStart().length;
// Where a value starts on a YAML line: after leading spaces, list dashes and a `key:`.
const VALUE_START = /^\s*(?:-\s+)*(?:(?:"[^"]*"|'[^']*'|[^\s:#"'-][^:]*?):(?=\s|$)\s*)?/;

/**
 * The open `dsds:` link at `caret` in the YAML view, or null. YAML holds Markdown in its values, so
 * what counts as code is decided inside the value: a one-line value on its own, and for the lines of
 * a block scalar (`description: |`) the whole block, with its indentation taken off, so a fence that
 * opens on one line still applies a few lines later. `from` is a position in the whole document.
 */
export function linkInYaml(text: string, caret: number): OpenLink | null {
  const lines = text.split('\n');
  const starts: number[] = [];
  let pos = 0;
  for (const l of lines) {
    starts.push(pos);
    pos += l.length + 1;
  }
  let i = 0;
  while (i + 1 < starts.length && (starts[i + 1] ?? Infinity) <= caret) i++;
  const line = lines[i] ?? '';
  const col = caret - (starts[i] ?? 0);
  if (!/dsds:/i.test(line.slice(0, col))) return null;

  const valueStart = VALUE_START.exec(line)?.[0].length ?? 0;
  if (valueStart > leadingSpaces(line)) {
    // A key, or a list item: the value is the rest of this one line.
    if (col < valueStart) return null;
    const link = linkAt(line.slice(valueStart), col - valueStart);
    return link && { from: caret - link.query.length, query: link.query };
  }

  // A continuation line: the lines of the same block, from the key's line down to the next key.
  const indent = leadingSpaces(line);
  const blank = (l: string) => l.trim() === '';
  let first = i;
  while (
    first > 0 &&
    (blank(lines[first - 1] ?? '') || leadingSpaces(lines[first - 1] ?? '') >= indent)
  )
    first--;
  let last = i;
  while (
    last < lines.length - 1 &&
    (blank(lines[last + 1] ?? '') || leadingSpaces(lines[last + 1] ?? '') >= indent)
  )
    last++;
  const block = lines.slice(first, last + 1);
  const strip = Math.min(...block.filter((l) => !blank(l)).map(leadingSpaces));
  const stripped = block.map((l) => l.slice(Math.min(strip, leadingSpaces(l))));
  const before = stripped.slice(0, i - first).reduce((n, l) => n + l.length + 1, 0);
  const link = linkAt(stripped.join('\n'), before + col - Math.min(strip, leadingSpaces(line)));
  return link && { from: caret - link.query.length, query: link.query };
}

/** Project targets matching what was typed: prefix matches first, then other substring matches. */
export function suggestTargets(targets: RefTarget[], query: string, limit = 12): RefTarget[] {
  const q = query.toLowerCase();
  const rank = (t: RefTarget): number => {
    const id = t.target.toLowerCase();
    if (id.startsWith(q)) return 0;
    if (id.includes(q)) return 1;
    return t.label.toLowerCase().includes(q) ? 2 : 3;
  };
  // Within a match quality, whole entries come before `entry#address` items.
  const order = (t: RefTarget) => rank(t) * 2 + (t.target.includes('#') ? 1 : 0);
  return targets
    .filter((t) => rank(t) < 3)
    .sort((a, b) => order(a) - order(b))
    .slice(0, limit);
}
