import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SchemaBundle,
  defaultValueFor,
  effective,
  kindOptions,
  nodeOf,
  propertyOf,
  containsChoices,
  variantChoices,
  type JsonSchema,
} from '@shared/schema';
import { packDir } from './helpers';

const bundle = new SchemaBundle(
  JSON.parse(
    readFileSync(join(packDir(), 'schema/dsds.bundled.schema.json'), 'utf8'),
  ) as JsonSchema,
);
const doc = effective(bundle, nodeOf(bundle.documentFragment()), {});
const keys = (e: ReturnType<typeof effective>) => e.properties.map((p) => p.key);

/** The effective schema of `entries[]` items for a given entry value. */
function entryEff(value: unknown) {
  const entries = propertyOf(bundle, doc, 'entries', {})!;
  return effective(bundle, entries.items!, value);
}

describe('schema model on the real bundle', () => {
  it('reads the base document', () => {
    expect(doc.type).toBe('object');
    expect(doc.required).toEqual(['schemaVersion', 'name', 'entries']);
    expect(keys(doc)).toEqual(
      expect.arrayContaining(['schemaVersion', 'name', 'entries', 'shared', 'refs', '$extensions']),
    );
    expect(doc.closed).toBe(true);
  });

  it('picks the entry schema by kind (if/then/else dispatch)', () => {
    const component = entryEff({ kind: 'component' });
    expect(keys(component)).toEqual(
      expect.arrayContaining(['sourceFiles', 'traits', 'combos', 'imports']),
    );
    const token = entryEff({ kind: 'token' });
    expect(keys(token)).toEqual(expect.arrayContaining(['tokenType', 'source']));
    expect(keys(token)).not.toContain('traits');
    const generic = entryEff({ kind: 'entry' });
    expect(keys(generic)).not.toContain('traits');
    expect(keys(generic)).toEqual(
      expect.arrayContaining(['id', 'name', 'description', 'sections']),
    );
  });

  it('treats a namespaced custom kind as the generic open entry', () => {
    const custom = entryEff({ kind: 'acme.icon-library' });
    expect(keys(custom)).toContain('description');
    expect(custom.closed).toBe(false);
  });

  it('merges allOf: a guidelines section has shared and own fields, and typed items', () => {
    const sections = propertyOf(bundle, entryEff({ kind: 'entry' }), 'sections', {})!;
    const g = effective(bundle, sections.items!, { kind: 'guidelines', for: 'all' });
    expect(keys(g)).toEqual(
      expect.arrayContaining(['kind', 'for', 'title', 'framing', 'items', 'freeform']),
    );
    const items = propertyOf(bundle, g, 'items', {})!;
    const item = effective(bundle, items.items!, { statement: 'x' });
    expect(keys(item)).toEqual(expect.arrayContaining(['statement', 'level', 'checkedBy', 'refs']));
    expect(item.closed).toBe(true);
  });

  it('offers section kinds from the schema, including none hardcoded in the app', () => {
    const sections = propertyOf(bundle, entryEff({ kind: 'entry' }), 'sections', {})!;
    expect(kindOptions(bundle, sections.items!)).toEqual(
      expect.arrayContaining(['guidelines', 'definitions', 'steps', 'section']),
    );
  });

  it('offers entry kinds', () => {
    const entries = propertyOf(bundle, doc, 'entries', {})!;
    expect(kindOptions(bundle, entries.items!)).toEqual(
      expect.arrayContaining(['system', 'token', 'theme', 'component', 'entry']),
    );
  });

  it('turns enums into select options and open sets into suggestions', () => {
    const forField = effective(
      bundle,
      effective(bundle, propertyOf(bundle, entryEff({ kind: 'entry' }), 'sections', {})!.items!, {
        kind: 'section',
      }).properties.find((p) => p.key === 'for')!.node,
      'all',
    );
    expect(forField.enum).toEqual(['all', 'human', 'agent']);
    const kind = propertyOf(bundle, entryEff({}), 'kind', {})!;
    expect(kind.type).toBe('string');
    expect(kind.suggestions).toContain('component');
    expect(kind.enum).toBeUndefined();
  });

  it('exposes shared-schema names so widgets can be chosen by what a field is', () => {
    const description = propertyOf(bundle, entryEff({ kind: 'entry' }), 'description', {})!;
    expect(description.refNames).toContain('common/markdown');
    const uses = propertyOf(bundle, entryEff({ kind: 'entry' }), 'uses', {})!;
    expect(uses.type).toBe('array');
    const target = effective(bundle, uses.items!, { to: 'button' });
    expect(keys(target)).toEqual(expect.arrayContaining(['to', 'href']));
  });

  it('builds a valid-shaped default for a new section', () => {
    const sections = propertyOf(bundle, entryEff({ kind: 'entry' }), 'sections', {})!;
    const value = defaultValueFor(bundle, sections.items!, { kind: 'guidelines' }) as Record<
      string,
      unknown
    >;
    expect(value.kind).toBe('guidelines');
    expect(value.for).toBe('all');
  });

  it('shows component traits as a list whose items depend on `kind`', () => {
    const traits = propertyOf(bundle, entryEff({ kind: 'component' }), 'traits', {})!;
    const enumTrait = effective(bundle, traits.items!, { kind: 'enum', traitType: 'variant' });
    expect(keys(enumTrait)).toContain('values');
    const boolTrait = effective(bundle, traits.items!, { kind: 'boolean', traitType: 'state' });
    expect(keys(boolTrait)).not.toContain('values');
  });
});

describe('variant choices for an "Add" button', () => {
  const sectionsOf = (kind: string) => {
    const e = entryEff({ kind: 'component' });
    const sections = propertyOf(bundle, e, 'sections', [])!.items!;
    return effective(bundle, sections, { kind, for: 'all' });
  };
  const itemsNode = (kind: string) => propertyOf(bundle, sectionsOf(kind), 'items', [])!.items!;

  it('tells apart the two shapes of a guideline item by what each one requires', () => {
    const item = effective(bundle, itemsNode('guidelines'), undefined);
    expect(item.variantNodes).toHaveLength(2);
    const choices = variantChoices(bundle, item.variantNodes ?? [], itemsNode('guidelines'));
    expect(choices.map((c) => c.label)).toEqual(['statement', 'refs']);
    // Each says what that field is, from the schema's own description.
    expect(choices[0]?.description).toMatch(/usage rule/i);
    expect(new Set(choices.map((c) => c.label)).size).toBe(choices.length);
  });

  it('never offers two buttons with the same label', () => {
    // Walk the lists the form shows with variants: every choice set must be distinguishable.
    for (const kind of ['guidelines', 'definitions', 'steps', 'section']) {
      const items = propertyOf(bundle, sectionsOf(kind), 'items', []);
      const eff = items?.items ? effective(bundle, items.items, undefined) : null;
      const choices = variantChoices(bundle, eff?.variantNodes ?? []);
      expect(new Set(choices.map((c) => c.label)).size).toBe(choices.length);
    }
  });

  it('keeps naming text-or-object alternatives (a link as text, or as a pointer)', () => {
    const e = entryEff({ kind: 'component' });
    const uses = propertyOf(bundle, e, 'uses', [])!;
    const eff = effective(bundle, uses.items!, undefined);
    expect(variantChoices(bundle, eff.variantNodes ?? []).map((c) => c.label)).toEqual([
      'text link',
      'pointer',
    ]);
  });
});

describe('pointers a list must contain', () => {
  const refsOf = (item: unknown) => {
    const e = entryEff({ kind: 'component' });
    const sections = propertyOf(bundle, e, 'sections', [])!.items!;
    const g = effective(bundle, sections, { kind: 'guidelines', for: 'all' });
    const items = propertyOf(bundle, g, 'items', [])!.items!;
    return propertyOf(bundle, effective(bundle, items, item), 'refs', [])!;
  };

  it('reads what a pointing guideline item must contain from the schema', () => {
    const refs = refsOf({ refs: [] });
    const choices = containsChoices(bundle, refs);
    expect(choices.map((c) => c.label)).toEqual(['same-as pointer', 'relates-to link']);
    expect(choices.map((c) => c.seed)).toEqual([
      { rel: 'same-as', to: '' },
      { rel: 'relates-to', href: '' },
    ]);
  });

  it('is satisfied by an item of either shape, and not by another', () => {
    const refs = refsOf({ refs: [] });
    const [same, relates] = containsChoices(bundle, refs);
    expect(same?.satisfiedBy({ rel: 'same-as', to: 'shared-a11y#x' })).toBe(true);
    expect(same?.satisfiedBy({ rel: 'relates-to', href: 'https://x.test' })).toBe(false);
    expect(relates?.satisfiedBy({ rel: 'relates-to', href: 'https://x.test' })).toBe(true);
    expect(same?.satisfiedBy('https://plain.link')).toBe(false);
  });

  it('has nothing to require for a list the schema leaves open', () => {
    const e = entryEff({ kind: 'component' });
    const uses = propertyOf(bundle, e, 'uses', [])!;
    expect(containsChoices(bundle, uses)).toEqual([]);
  });
});
