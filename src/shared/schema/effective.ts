import type { Fragment, JsonSchema, SchemaBundle } from './bundle';
import { fits } from './check';

/** A property or item schema: possibly several fragments that all apply (`allOf`). */
export interface SchemaNode {
  fragments: Fragment[];
}

export interface EffectiveSchema {
  type?: string;
  title?: string;
  description?: string;
  comment?: string;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  format?: string;
  /** Allowed values offered as suggestions when the field is an open set (enum OR namespaced). */
  suggestions?: unknown[];
  required: string[];
  properties: Array<{ key: string; node: SchemaNode }>;
  /** The schema forbids fields it does not declare. */
  closed: boolean;
  items?: SchemaNode;
  minItems?: number;
  /** Names of the shared schemas this came from, e.g. `common/markdown`. Used to pick widgets. */
  refNames: string[];
  /** When the schema allows several different shapes (e.g. a link as text OR as an object). */
  variantNodes?: SchemaNode[];
  /** The object's keys have to match this pattern (e.g. namespaced `$extensions` keys). */
  keyPattern?: string;
}

const isObject = (v: unknown): v is JsonSchema =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const nodeOf = (frag: Fragment): SchemaNode => ({ fragments: [frag] });

/**
 * Work out what a schema means for a particular value: follow `$ref`s, merge `allOf`, pick the
 * `if/then/else` branch the value falls into, and choose among `oneOf`/`anyOf` alternatives.
 * Pass `undefined` for a field that has no value yet.
 */
export function effective(bundle: SchemaBundle, node: SchemaNode, value: unknown): EffectiveSchema {
  const eff: EffectiveSchema = { required: [], properties: [], closed: false, refNames: [] };
  const byKey = new Map<string, SchemaNode>();
  const itemFrags: Fragment[] = [];
  const queue: Fragment[] = [...node.fragments];
  const stringVariantEnums: unknown[] = [];
  let guard = 0;

  while (queue.length && guard++ < 200) {
    const frag = bundle.deref(queue.shift() as Fragment);
    const s = frag.schema;
    const sub = (x: unknown): Fragment => ({ schema: x as JsonSchema, resource: frag.resource });
    eff.refNames.push(...frag.refNames);

    eff.type ??= typeof s.type === 'string' ? s.type : undefined;
    eff.title ??= str(s.title);
    eff.description ??= str(s.description);
    eff.comment ??= str(s.$comment);
    eff.example ??= firstExample(s);
    eff.default ??= s.default;
    eff.enum ??= Array.isArray(s.enum) ? s.enum : undefined;
    eff.const ??= s.const;
    eff.pattern ??= str(s.pattern);
    eff.format ??= str(s.format);
    eff.minItems = Math.max(eff.minItems ?? 0, typeof s.minItems === 'number' ? s.minItems : 0);
    if (Array.isArray(s.required)) {
      for (const k of s.required)
        if (typeof k === 'string' && !eff.required.includes(k)) eff.required.push(k);
    }
    if (s.additionalProperties === false || s.unevaluatedProperties === false) eff.closed = true;
    if (isObject(s.propertyNames))
      eff.keyPattern ??= str(bundle.deref(sub(s.propertyNames)).schema.pattern);

    if (isObject(s.properties)) {
      eff.type ??= 'object';
      for (const [key, p] of Object.entries(s.properties)) {
        const existing = byKey.get(key);
        if (existing) existing.fragments.push(sub(p));
        else byKey.set(key, { fragments: [sub(p)] });
      }
    }
    if (isObject(s.items)) {
      eff.type ??= 'array';
      itemFrags.push(sub(s.items));
    }

    if (Array.isArray(s.allOf)) queue.push(...s.allOf.map(sub));

    if (isObject(s.if)) {
      const branch = fits(bundle, sub(s.if), value) ? s.then : s.else;
      if (isObject(branch)) queue.push(sub(branch));
    }

    for (const key of ['oneOf', 'anyOf'] as const) {
      const list = s[key];
      if (!Array.isArray(list)) continue;
      const variants = list.map(sub);
      const derefd = variants.map((v) => bundle.deref(v).schema);
      // Alternatives that are all plain strings are one open-set text field: offer the enum
      // values as suggestions instead of forcing a choice.
      if (derefd.every((d) => d.type === 'string')) {
        eff.type ??= 'string';
        for (const d of derefd) {
          if (Array.isArray(d.enum)) stringVariantEnums.push(...d.enum);
          eff.default ??= d.default;
          eff.example ??= firstExample(d);
          eff.description ??= str(d.description);
        }
        continue;
      }
      eff.variantNodes ??= variants.map(nodeOf);
      const chosen =
        value === undefined
          ? variants[0]
          : (variants.find((v) => fits(bundle, v, value)) ??
            variants.find((v) => fits(bundle, v, value, true)) ??
            variants[0]);
      if (chosen) queue.push(chosen);
    }
  }

  eff.properties = [...byKey].map(([key, n]) => ({ key, node: n }));
  if (itemFrags.length) eff.items = { fragments: itemFrags };
  if (stringVariantEnums.length) eff.suggestions = [...new Set(stringVariantEnums)];
  return eff;
}

/** The effective schema of one property of an object value. */
export function propertyOf(
  bundle: SchemaBundle,
  eff: EffectiveSchema,
  key: string,
  value: unknown,
): EffectiveSchema | null {
  const prop = eff.properties.find((p) => p.key === key);
  if (!prop) return null;
  const child = isRecord(value) ? value[key] : undefined;
  return effective(bundle, prop.node, child);
}

/** A starting value for a new field/item: required fields filled with sensible blanks. */
export function defaultValueFor(bundle: SchemaBundle, node: SchemaNode, seed?: unknown): unknown {
  const eff = effective(bundle, node, seed);
  if (eff.const !== undefined) return eff.const;
  if (eff.default !== undefined) return eff.default;
  switch (eff.type) {
    case 'object': {
      const out: Record<string, unknown> = isRecord(seed) ? { ...seed } : {};
      for (const key of eff.required) {
        if (key in out) continue;
        const prop = eff.properties.find((p) => p.key === key);
        out[key] = prop ? defaultValueFor(bundle, prop.node) : '';
      }
      return out;
    }
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return 0;
    default:
      return '';
  }
}

/**
 * The kinds an item can be, for an "Add ..." menu. Read from the item schema's own `kind` field
 * (an enum, possibly open to namespaced custom values), so a new upstream kind shows up with no
 * code change. Empty when the item schema has no `kind`.
 */
export function kindOptions(bundle: SchemaBundle, itemNode: SchemaNode): string[] {
  const eff = effective(bundle, itemNode, {});
  const kind = eff.properties.find((p) => p.key === 'kind');
  if (!kind) return [];
  const k = effective(bundle, kind.node, undefined);
  return [...(k.enum ?? []), ...(k.suggestions ?? [])].filter(
    (v): v is string => typeof v === 'string',
  );
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
function firstExample(s: JsonSchema): unknown {
  if ('example' in s) return s.example;
  return Array.isArray(s.examples) ? s.examples[0] : undefined;
}
