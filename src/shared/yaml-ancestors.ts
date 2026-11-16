const isBlank = (line: string): boolean => /^\s*(#.*)?$/.test(line);
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** Column where the line's own key/value starts: past the indent and any `- ` sequence markers. */
const contentColumn = (line: string): number => {
  const m = /^\s*(?:-\s+)*/.exec(line);
  return m ? m[0].length : 0;
};

/**
 * The lines that enclose `lineNo` (1-based) in an indented YAML text, outermost first: each is the
 * nearest line above with a smaller indent than the one before it. Blank and comment-only lines
 * carry no structure and are skipped; a blank target line uses the next line with content. Used
 * for the editor's sticky header. A `- key:` line only
 * counts as a parent of lines nested under its key (not of its sibling keys). Keeps the outermost
 * `max` when the chain is longer.
 */
export function ancestorLines(lines: readonly string[], lineNo: number, max = Infinity): number[] {
  let at = lineNo;
  while (at <= lines.length && isBlank(lines[at - 1] ?? '')) at++;
  if (at > lines.length) return [];
  let indent = indentOf(lines[at - 1] as string);
  const out: number[] = [];
  for (let i = at - 1; i >= 1 && indent > 0; i--) {
    const line = lines[i - 1] as string;
    if (isBlank(line)) continue;
    if (contentColumn(line) < indent) {
      out.push(i);
      indent = indentOf(line);
    }
  }
  return out.reverse().slice(0, max);
}
