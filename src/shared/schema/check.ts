import type { Fragment, JsonSchema, SchemaBundle } from './bundle';

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * "Does this value plausibly fit this schema?" A forgiving subset of JSON Schema, used to pick
 * the `if/then/else` branch and the `oneOf`/`anyOf` variant while a form is being edited. It is
 * NOT validation (the pack's validator does that); it never rejects for closed objects or
 * unknown keywords, so a half-filled document still picks a sensible branch.
 */
export function fits(
  bundle: SchemaBundle,
  frag: Fragment,
  value: unknown,
  lenient = false,
): boolean {
  const { schema, resource } = bundle.deref(frag);
  const sub = (s: unknown): Fragment => ({ schema: s as JsonSchema, resource });

  const type = schema.type;
  if (typeof type === 'string') {
    const t = typeOf(value);
    if (type !== t && !(type === 'number' && t === 'integer')) return false;
  }
  if ('const' in schema && schema.const !== value) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (typeof schema.pattern === 'string' && typeof value === 'string') {
    try {
      if (!new RegExp(schema.pattern).test(value)) return false;
    } catch {
      /* an unsupported pattern is not a reason to reject */
    }
  }
  if (isObject(value)) {
    if (!lenient && Array.isArray(schema.required) && !schema.required.every((k) => k in value))
      return false;
    if (isObject(schema.properties)) {
      for (const [k, s] of Object.entries(schema.properties)) {
        if (k in value && !fits(bundle, sub(s), value[k], lenient)) return false;
      }
    }
  }
  if (Array.isArray(value) && isObject(schema.items) && '$ref' in schema.items === false) {
    if (!value.every((v) => fits(bundle, sub(schema.items), v, lenient))) return false;
  }
  if (isObject(schema.not) && fits(bundle, sub(schema.not), value)) return false;
  if (
    Array.isArray(schema.allOf) &&
    !schema.allOf.every((s) => fits(bundle, sub(s), value, lenient))
  ) {
    return false;
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    const list = schema[key];
    if (Array.isArray(list) && !list.some((s) => fits(bundle, sub(s), value, lenient)))
      return false;
  }
  if (isObject(schema.if)) {
    const branch = fits(bundle, sub(schema.if), value) ? schema.then : schema.else;
    if (isObject(branch) && !fits(bundle, sub(branch), value, lenient)) return false;
  }
  return true;
}
