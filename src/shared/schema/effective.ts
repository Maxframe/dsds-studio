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
  /**
   * What the list has to contain at least one of (`contains`): the alternatives an item may match.
   * Empty when the schema does not say.
   */
  contains?: SchemaNode[];
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

    if (isObject(s.contains)) {
      const wanted = bundle.deref(sub(s.contains)).schema;
      const alternatives = Array.isArray(wanted.anyOf) ? wanted.anyOf.map(sub) : [sub(s.contains)];
      eff.contains = [...(eff.contains ?? []), ...alternatives.map(nodeOf)];
    }

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

export interface VariantChoice {
  /** What the "Add" button says, after "+ Add". */
  label: string;
  /** What the choice means, from the schema (a tooltip). */
  description?: string;
  /** A plain-text alternative (a bare string), as opposed to an object. */
  text: boolean;
  /** For an object alternative: its required fields, empty, to start a new item from. */
  seed?: Record<string, unknown>;
  node: SchemaNode;
}

/**
 * The alternatives a list item can take (`oneOf`/`anyOf`), named so an "Add" button for each is
 * distinguishable. A text alternative is a "text link", the only object alternative next to it a
 * "pointer". When several object alternatives differ, each is named by the field it requires that
 * the others do not, read from the schema, e.g. a guideline item is either a `statement` or `refs`.
 * `parent` is where those fields are described, for the tooltip.
 */
export function variantChoices(
  bundle: SchemaBundle,
  variants: SchemaNode[],
  /** The item schema the variants belong to: where the fields they require are described. */
  parent?: SchemaNode,
): VariantChoice[] {
  const parentEff = parent ? effective(bundle, parent, undefined) : null;
  const effs = variants.map((v) => effective(bundle, v, undefined));
  const objects = effs.filter((e) => e.type !== 'string');
  const required = effs.map((e) => new Set(e.required));
  const labels = variants.map((node, i): VariantChoice => {
    const e = effs[i] as EffectiveSchema;
    // A variant that says it is an object knows its own required fields, including a choice inside
    // it (a pointer is `to` or `href`), so it can start itself. One that is only `required: [...]`
    // has no `type`: build its starting value from the required fields instead, taking their
    // defaults from the parent's full definition (a variant may hold only a fragment of it).
    const started = defaultValueFor(bundle, node, undefined);
    const base: Record<string, unknown> =
      typeof started === 'object' && started !== null ? { ...started } : {};
    const seed: Record<string, unknown> = { ...base };
    for (const k of e.required) {
      const prop = parentEff?.properties.find((p) => p.key === k);
      if (prop) seed[k] = defaultValueFor(bundle, prop.node);
      else if (!(k in base)) seed[k] = '';
    }
    if (e.type === 'string') return { label: 'text link', text: true, node };
    if (objects.length <= 1) return { label: 'pointer', text: false, seed, node };
    const own = e.required.find((k) => !required.every((r) => r.has(k)));
    const prop = own
      ? (parentEff?.properties.find((p) => p.key === own) ??
        e.properties.find((p) => p.key === own))
      : undefined;
    return {
      label: own ?? 'item',
      text: false,
      seed,
      description: prop ? effective(bundle, prop.node, undefined).description : undefined,
      node,
    };
  });
  // Never two identical buttons: number any that still collide.
  const seen = new Map<string, number>();
  return labels.map((c) => {
    const n = (seen.get(c.label) ?? 0) + 1;
    seen.set(c.label, n);
    return n > 1 || labels.filter((o) => o.label === c.label).length > 1
      ? { ...c, label: `${c.label} ${n}` }
      : c;
  });
}

export interface ContainsChoice {
  /** What the "Add" button says, after "+ Add": for example `same-as pointer`. */
  label: string;
  /** A new item that already has the fixed fields (like `rel`) and empty required ones. */
  seed: Record<string, unknown>;
  node: SchemaNode;
  /** Does this item already meet the requirement? */
  satisfiedBy(item: unknown): boolean;
}

/**
 * What a list must contain at least one of (the schema's `contains`), as ready-made starting
 * points. A guideline item that points elsewhere must hold a `same-as` pointer to something in the
 * project, or a `relates-to` link outside it; each alternative becomes one choice whose `rel` is
 * already set. Empty for a list with no such rule.
 */
export function containsChoices(bundle: SchemaBundle, list: EffectiveSchema): ContainsChoice[] {
  return (list.contains ?? []).map((node) => {
    const e = effective(bundle, node, undefined);
    const fixed: string[] = [];
    const seed: Record<string, unknown> = {};
    const targets: string[] = [];
    for (const key of e.required) {
      const prop = e.properties.find((p) => p.key === key);
      const constant = prop ? effective(bundle, prop.node, undefined).const : undefined;
      if (constant !== undefined) {
        seed[key] = constant;
        if (typeof constant === 'string') fixed.push(constant);
      } else {
        seed[key] = '';
        targets.push(key);
      }
    }
    // `to` points inside the project and `href` outside it, the words the form uses elsewhere.
    const word = targets.map((k) => (k === 'to' ? 'pointer' : k === 'href' ? 'link' : k)).join(' ');
    return {
      label: [...fixed, word].filter(Boolean).join(' '),
      seed,
      node,
      satisfiedBy: (item) => node.fragments.every((f) => fits(bundle, f, item)),
    };
  });
}
