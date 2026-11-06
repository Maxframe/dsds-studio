import type { RefTarget } from './types';

/** An unfinished `dsds:` link the caret is inside: where its target starts and what is typed. */
export interface OpenLink {
  from: number;
  query: string;
}

// `<dsds:…` or `](dsds:…` / `(dsds:…`, with no whitespace or closing character typed yet.
const OPEN_LINK = /[(<]dsds:([^\s)>\]"']*)$/;

/** The open `dsds:` link ending at `caret`, or null. Only the text before the caret counts. */
export function linkAt(text: string, caret: number): OpenLink | null {
  const m = OPEN_LINK.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[1] ?? '';
  return { from: caret - query.length, query };
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
