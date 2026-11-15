/**
 * Custom kinds are namespaced (`acme.widget`): the schema requires a dot so a custom value cannot
 * collide with a well-known one. People should not have to think about that. They type "Widget"; the
 * app stores `<project namespace>.widget` and shows "Widget" again, without the namespace.
 */
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const isNamespaced = (value: string) => value.includes('.');
const localPart = (value: string) => value.slice(value.lastIndexOf('.') + 1);
const humanize = (local: string) => {
  const words = local.replace(/-+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * What to show for each value: a well-known one as it is, a custom one by its own name. Where two
 * custom values would read the same (`acme.test`, `other.test`), both keep their full value.
 */
export function kindLabels(values: readonly string[]): Map<string, string> {
  const unique = [...new Set(values)];
  const count = new Map<string, number>();
  for (const v of unique) {
    if (isNamespaced(v)) count.set(localPart(v), (count.get(localPart(v)) ?? 0) + 1);
  }
  return new Map(
    unique.map((v) => [
      v,
      !isNamespaced(v) || (count.get(localPart(v)) ?? 0) > 1 ? v : humanize(localPart(v)),
    ]),
  );
}

/**
 * Turn what a person typed into a valid namespaced value, or null when nothing usable was typed.
 * `pattern` is the schema's own pattern for such values, which decides what is valid.
 */
export function normalizeCustom(typed: string, namespace: string, pattern?: string): string | null {
  const text = typed.trim();
  const valid = (v: string) => (pattern ? new RegExp(pattern).test(v) : isNamespaced(v));
  if (valid(text)) return text;
  const name = slug(text);
  if (!name) return null;
  const candidate = `${namespace}.${name}`;
  return valid(candidate) ? candidate : null;
}

/**
 * The namespace new custom values get: the one the project already uses most, so a project stays
 * consistent; otherwise the first of `names` that leaves something usable (the system entry's id,
 * which is in the document and should not change, then the project's own name).
 */
export function projectNamespace(
  values: readonly string[],
  ...names: Array<string | undefined>
): string {
  const count = new Map<string, number>();
  for (const v of values) {
    if (!isNamespaced(v)) continue;
    const ns = v.slice(0, v.lastIndexOf('.'));
    count.set(ns, (count.get(ns) ?? 0) + 1);
  }
  const [top] = [...count].sort((a, b) => b[1] - a[1]);
  return top?.[0] ?? names.map((n) => slug(n ?? '')).find(Boolean) ?? 'custom';
}
