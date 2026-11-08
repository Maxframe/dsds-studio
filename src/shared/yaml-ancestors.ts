const isBlank = (line: string): boolean => /^\s*(#.*)?$/.test(line);
const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * The lines that enclose `lineNo` (1-based) in an indented YAML text, outermost first: each is the
 * nearest line above with a smaller indent than the one before it. Blank and comment-only lines
 * carry no structure and are skipped; a blank target line uses the next line with content. Used
 * for the editor's sticky header. Keeps the nearest `max` when the chain is longer.
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
    const ind = indentOf(line);
    if (ind < indent) {
      out.push(i);
      indent = ind;
    }
  }
  return out.reverse().slice(-max);
}
