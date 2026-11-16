// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaBundle, effective, nodeOf, propertyOf, type JsonSchema } from '@shared/schema';
import { getAtPointer } from '@shared/pointer';
import type { EditOp, Finding, ResolvedItem } from '@shared/types';
import { FormProvider, type FormContext } from '../src/web/form/context';
import { SchemaField } from '../src/web/form/SchemaField';
import './dom-polyfills';
import { iconButtonsMissingHints, iconOnlyButtons } from './icon-buttons';
import { choose, optionsOf } from './select';
import { packDir } from './helpers';

const bundle = new SchemaBundle(
  JSON.parse(
    readFileSync(join(packDir(), 'schema/dsds.bundled.schema.json'), 'utf8'),
  ) as JsonSchema,
);
const entryItems = propertyOf(
  bundle,
  effective(bundle, nodeOf(bundle.documentFragment()), {}),
  'entries',
  {},
)!.items!;

afterEach(cleanup);

function setup(value: unknown, extra: Partial<FormContext> = {}) {
  const apply = vi.fn<(ops: EditOp[]) => Promise<void>>().mockResolvedValue();
  const ctx: FormContext = {
    bundle,
    apply,
    findings: [],
    targets: [],
    usage: () => new Map(),
    namespace: 'acme',
    valueAt: (pointer) => getAtPointer({ entries: [value] }, pointer),
    reused: () => undefined,
    requestIdChange: (_from, _to, done) => done.commit(),
    succession: () => undefined,
    focus: null,
    ...extra,
  };
  render(
    <FormProvider value={ctx}>
      <SchemaField node={entryItems} value={value} pointer="/entries/0" />
    </FormProvider>,
  );
  return { apply, user: userEvent.setup() };
}

const component = {
  kind: 'component',
  id: 'button',
  name: 'Button',
  description: 'A button.',
  sections: [
    { kind: 'guidelines', for: 'all', items: [{ level: 'must', statement: 'Be accessible.' }] },
  ],
};

describe('adding a guideline item', () => {
  const empty = {
    ...component,
    sections: [{ kind: 'guidelines', for: 'all', items: [] }],
  };
  const addButtons = () =>
    [...document.querySelectorAll<HTMLElement>('.list-add button')].map((b) => b.textContent);

  it('offers distinct buttons for the two shapes, named after what each holds', () => {
    setup(empty);
    expect(addButtons()).toEqual(['+ Add statement', '+ Add refs']);
    // The tooltip says what it means, from the schema.
    const statement = screen.getByRole('button', { name: '+ Add statement' });
    expect(statement.getAttribute('title')).toMatch(/usage rule/i);
  });

  it('a statement item starts with its level, a pointer item without one', async () => {
    const { apply, user } = setup(empty);
    await user.click(screen.getByRole('button', { name: '+ Add statement' }));
    const [stated] = apply.mock.calls[0]?.[0] ?? [];
    expect(stated).toMatchObject({ op: 'append', value: { statement: '' } });
    expect(Object.keys((stated as { value: object }).value)).toContain('level');

    apply.mockClear();
    await user.click(screen.getByRole('button', { name: '+ Add refs' }));
    const [pointer] = apply.mock.calls[0]?.[0] ?? [];
    expect((pointer as { value: object }).value).toEqual({ refs: [] });
  });
});

describe('adding a step', () => {
  it('starts with its title: a step needs one unless it only points elsewhere', async () => {
    const { apply, user } = setup({
      ...component,
      sections: [{ kind: 'steps', for: 'all', items: [{ title: 'First' }] }],
    });
    await user.click(screen.getByRole('button', { name: '+ Add items' }));
    expect(apply.mock.calls[0]?.[0]).toEqual([
      { op: 'append', pointer: '/entries/0/sections/0/items', value: { title: '' } },
    ]);
  });
});

describe('adding a pointer to a list of refs', () => {
  const withRefs = {
    ...component,
    sections: [{ kind: 'guidelines', for: 'all', items: [{ refs: [] }] }],
  };
  const added = async (name: string) => {
    const { apply, user } = setup(withRefs);
    await user.click(screen.getByRole('button', { name }));
    const [op] = apply.mock.calls[0]?.[0] ?? [];
    return op as { op: string; pointer: string; value: unknown };
  };

  it('a text link is a plain string, a pointer is an object that says what it is and where', async () => {
    const link = await added('+ Add text link');
    expect(link).toMatchObject({
      op: 'append',
      pointer: expect.stringMatching(/\/refs$/),
      value: '',
    });
    cleanup();
    const pointer = await added('+ Add pointer');
    expect(typeof pointer.value).toBe('object');
    // `rel` is required, and exactly one of `to` / `href`: the pointer starts with both decided.
    expect(Object.keys(pointer.value as object).sort()).toEqual(['rel', 'to']);
  });

  it('the two buttons never add the same thing', async () => {
    const link = await added('+ Add text link');
    cleanup();
    const pointer = await added('+ Add pointer');
    expect(pointer.value).not.toEqual(link.value);
  });
});

describe('a pointing guideline item must contain a same-as or relates-to pointer', () => {
  const guidelinesWith = (refs: unknown[]) => ({
    ...component,
    sections: [{ kind: 'guidelines', for: 'all', items: [{ refs }] }],
  });
  const buttons = () =>
    [...document.querySelectorAll<HTMLElement>('.list-add button')].map((b) => b.textContent);

  it('offers the shapes the schema asks for, ahead of the general ones', () => {
    setup(guidelinesWith([]));
    expect(buttons()).toEqual([
      '+ Add same-as pointer',
      '+ Add relates-to link',
      '+ Add text link',
      '+ Add pointer',
      '+ Add statement',
      '+ Add refs',
    ]);
  });

  it('adds a pointer that already says which kind it is', async () => {
    const { apply, user } = setup(guidelinesWith([]));
    await user.click(screen.getByRole('button', { name: '+ Add same-as pointer' }));
    expect(apply.mock.calls[0]?.[0]).toEqual([
      {
        op: 'append',
        pointer: '/entries/0/sections/0/items/0/refs',
        value: { rel: 'same-as', to: '' },
      },
    ]);
    apply.mockClear();
    await user.click(screen.getByRole('button', { name: '+ Add relates-to link' }));
    expect((apply.mock.calls[0]?.[0] ?? [])[0]).toMatchObject({
      value: { rel: 'relates-to', href: '' },
    });
  });

  it('stops offering them once the list holds one', () => {
    setup(guidelinesWith([{ rel: 'same-as', to: 'shared-a11y#touch-target' }]));
    expect(buttons()).not.toContain('+ Add same-as pointer');
    expect(buttons()).not.toContain('+ Add relates-to link');
    // The general buttons stay: more pointers can always be added.
    expect(buttons()).toContain('+ Add pointer');
  });
});

describe('new items go where the style guide puts them', () => {
  const withSections = (sections: unknown[]) => ({ ...component, sections });
  const ops = (apply: ReturnType<typeof setup>['apply']) => apply.mock.calls[0]?.[0] ?? [];

  it('adds a section next to the others of its kind, general to specific', async () => {
    const { apply, user } = setup(
      withSections([
        { kind: 'guidelines', for: 'all', items: [{ level: 'must', statement: 'A.' }] },
        { kind: 'steps', for: 'all', items: [{ title: 'One' }] },
      ]),
    );
    await choose(user, screen.getByRole('combobox', { name: 'Add sections' }), 'definitions');
    // Guidelines, then definitions, then steps: appended, then moved into the middle.
    expect(ops(apply)).toEqual([
      expect.objectContaining({ op: 'append', pointer: '/entries/0/sections' }),
      { op: 'move', pointer: '/entries/0/sections', from: 2, to: 1 },
    ]);
  });

  it('puts a when-to-use guidelines section ahead of how-to-use ones', async () => {
    const { apply, user } = setup(
      withSections([
        { kind: 'guidelines', for: 'all', items: [{ level: 'must', statement: 'A.' }] },
      ]),
    );
    await choose(user, screen.getByRole('combobox', { name: 'Add sections' }), 'steps');
    // Steps come after guidelines: a plain append.
    expect(ops(apply)).toHaveLength(1);
  });

  it('adds a guideline item at the end: its level is not chosen yet', async () => {
    const { apply, user } = setup(
      withSections([
        {
          kind: 'guidelines',
          for: 'all',
          items: [
            { level: 'must', statement: 'A.' },
            { level: 'should', statement: 'B.' },
          ],
        },
      ]),
    );
    await user.click(screen.getByRole('button', { name: '+ Add statement' }));
    expect(ops(apply)).toHaveLength(1);
  });
});

describe('ordering guideline items by level', () => {
  const withItems = (items: unknown[]) => ({
    ...component,
    sections: [{ kind: 'guidelines', for: 'all', items }],
  });
  const sortButton = () => screen.queryByRole('button', { name: 'Sort by level' });

  it('offers to sort items that are out of order, and sorts with moves', async () => {
    const { apply, user } = setup(
      withItems([
        { level: 'should', statement: 'B.' },
        { level: 'must', statement: 'A.' },
        { level: 'may', statement: 'C.' },
      ]),
    );
    await user.click(sortButton() as HTMLElement);
    expect(apply.mock.calls[0]?.[0]).toEqual([
      { op: 'move', pointer: '/entries/0/sections/0/items', from: 1, to: 0 },
    ]);
  });

  it('says nothing when the items are in order', () => {
    setup(
      withItems([
        { level: 'must', statement: 'A.' },
        { level: 'should', statement: 'B.' },
      ]),
    );
    expect(sortButton()).toBeNull();
  });

  it("does not guess for an item with no level of its own (it takes its target's)", () => {
    setup(
      withItems([
        { level: 'should', statement: 'B.' },
        { refs: [{ rel: 'same-as', to: 'shared-a11y#x' }] },
        { level: 'must', statement: 'A.' },
      ]),
    );
    expect(sortButton()).toBeNull();
  });
});

describe('list item heads', () => {
  const guidelines = (items: unknown[]) => ({
    ...component,
    sections: [{ kind: 'guidelines', for: 'all', items }],
  });
  const heads = () => [...document.querySelectorAll<HTMLElement>('.list-item-head .link-button')];
  const headOf = (text: string) => heads().find((h) => h.textContent?.includes(text));

  it('puts the requirement level in front of a guideline item, so a collapsed item has context', () => {
    setup(
      guidelines([
        { level: 'should', statement: 'Confirming a destructive action (delete, revoke access)' },
        { level: 'must-not', statement: 'Use it for navigation' },
        { level: 'may', statement: 'Add an icon' },
        { level: 'must', statement: 'Label it' },
      ]),
    );
    // More than three items start collapsed: the head is all there is to read.
    const should = headOf('Confirming a destructive action');
    expect(should?.querySelector('.list-item-prefix')?.textContent).toBe('SHOULD');
    expect(should?.textContent).toMatch(
      /SHOULD:\s+Confirming a destructive action \(delete, revoke access\)/,
    );
    expect(headOf('Use it for navigation')?.querySelector('.list-item-prefix')?.textContent).toBe(
      'MUST NOT',
    );
    expect(headOf('Add an icon')?.querySelector('.list-item-prefix')?.textContent).toBe('MAY');
  });

  it('says where an item points when it has no text of its own', () => {
    setup(
      guidelines([
        { level: 'must', refs: [{ to: 'shared-a11y#touch-target', rel: 'same-as' }] },
        { refs: [{ href: 'https://example.com/rule', rel: 'relates-to' }] },
      ]),
    );
    expect(headOf('shared-a11y#touch-target')?.textContent).toMatch(
      /MUST:\s+same-as shared-a11y#touch-target/,
    );
    // No level on this one, so no prefix; the target is still named.
    const rel = headOf('https://example.com/rule');
    expect(rel?.textContent).toContain('relates-to https://example.com/rule');
    expect(rel?.querySelector('.list-item-prefix')).toBeNull();
  });

  it('leaves items without a level as they were', () => {
    setup({
      ...component,
      sections: [{ kind: 'guidelines', for: 'all', title: 'Versioning', items: [] }],
    });
    const head = headOf('guidelines: Versioning');
    expect(head).toBeTruthy();
    expect(head?.querySelector('.list-item-prefix')).toBeNull();
  });

  it('shows a long statement in full up to a generous length, then shortens it', () => {
    const long = 'word '.repeat(60).trim();
    setup(guidelines([{ level: 'must', statement: long }]));
    const text = headOf('word word')?.textContent ?? '';
    expect(text).toContain('MUST:');
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThan(long.length);
  });
});

describe('schema-driven form', () => {
  it('gives every icon button a name and a hover hint', () => {
    setup(component);
    // The list item's move and remove buttons, the removable fields, and the combobox buttons.
    expect(iconOnlyButtons().length).toBeGreaterThan(3);
    expect(iconButtonsMissingHints()).toEqual([]);
  });

  it('shows a tooltip with the same text when an icon button is hovered', async () => {
    const { user } = setup(component);
    const down = screen.getAllByLabelText('Move down')[0] as HTMLElement;
    await user.hover(down);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Move down');
  });

  it('can still show a hint on a disabled icon button (the first item cannot move up)', async () => {
    const { user } = setup(component);
    const up = screen.getAllByLabelText('Move up')[0] as HTMLButtonElement;
    expect(up.disabled).toBe(true);
    await user.hover(up.parentElement as HTMLElement);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Move up');
  });

  it('renders the fields the schema declares for this kind', () => {
    setup(component);
    for (const label of ['kind', 'id', 'name', 'description', 'sections']) {
      expect(screen.getAllByText(label, { selector: 'label' }).length).toBeGreaterThan(0);
    }
    expect(screen.getByDisplayValue('Button')).toBeTruthy();
  });

  it('offers kind-specific optional fields from the schema (and not other kinds)', async () => {
    const { user } = setup(component);
    const add = screen.getAllByLabelText('Add field').at(-1) as HTMLElement; // the entry's own
    const options = await optionsOf(user, add);
    expect(options).toEqual(expect.arrayContaining(['traits', 'combos', 'sourceFiles', 'imports']));
    expect(options).not.toContain('tokenType');
  });

  it('picks an enum value from a select and commits it', async () => {
    const { apply, user } = setup(component);
    const audience = document.getElementById('/entries/0/sections/0/for') as HTMLElement;
    expect(audience.textContent).toContain('all');
    expect(await optionsOf(user, audience)).toEqual(expect.arrayContaining(['human', 'agent']));
    await user.click(screen.getByRole('option', { name: 'agent' }));
    expect(apply).toHaveBeenCalledWith([
      { op: 'set', pointer: '/entries/0/sections/0/for', value: 'agent' },
    ]);
  });

  it('commits an edited text field as a set op at its pointer', async () => {
    const { apply, user } = setup(component);
    const name = screen.getByDisplayValue('Button');
    await user.clear(name);
    await user.type(name, 'Primary Button');
    await user.tab();
    expect(apply).toHaveBeenCalledWith([
      { op: 'set', pointer: '/entries/0/name', value: 'Primary Button' },
    ]);
  });

  it('removes an optional field when it is cleared', async () => {
    const { apply, user } = setup({
      ...component,
      group: undefined,
      metadata: { group: 'actions' },
    });
    // metadata is an object; open nothing, just check clearing a nested optional string.
    const group = screen.getByDisplayValue('actions');
    await user.clear(group);
    await user.tab();
    expect(apply).toHaveBeenCalledWith([{ op: 'remove', pointer: '/entries/0/metadata/group' }]);
  });

  it('lists section kinds from the schema in the add menu and appends the chosen one', async () => {
    const { apply, user } = setup(component);
    const menu = screen.getByLabelText('Add sections');
    const kinds = await optionsOf(user, menu);
    expect(kinds).toEqual(
      expect.arrayContaining(['guidelines', 'definitions', 'steps', 'section']),
    );
    await user.click(screen.getByRole('option', { name: 'definitions' }));
    const op = apply.mock.calls[0]?.[0][0];
    expect(op).toMatchObject({ op: 'append', pointer: '/entries/0/sections' });
    expect((op as { value: { kind: string } }).value.kind).toBe('definitions');
  });

  it('reorders and removes list items with move/remove ops', async () => {
    const two = {
      ...component,
      sections: [...component.sections, { kind: 'steps', for: 'all', items: [{ title: 'Do it' }] }],
    };
    const { apply, user } = setup(two);
    const first = document.querySelector(
      '[data-pointer="/entries/0/sections/0#item"]',
    ) as HTMLElement;
    await user.click(within(first).getAllByLabelText('Move down')[0] as HTMLElement);
    expect(apply).toHaveBeenCalledWith([
      { op: 'move', pointer: '/entries/0/sections', from: 0, to: 1 },
    ]);
    const second = document.querySelector(
      '[data-pointer="/entries/0/sections/1#item"]',
    ) as HTMLElement;
    await user.click(within(second).getAllByLabelText('Remove')[0] as HTMLElement);
    expect(apply).toHaveBeenLastCalledWith([{ op: 'remove', pointer: '/entries/0/sections/1' }]);
  });

  it('shows validation findings next to the field they point at', () => {
    const finding: Finding = {
      rule: 'DSDS-04',
      severity: 'error',
      pointer: '/entries/0/id',
      message: 'duplicate id',
      fix: 'Rename it',
      docs: null,
    };
    setup(component, { findings: [finding] });
    expect(screen.getByText(/duplicate id/)).toBeTruthy();
    expect(screen.getByText('Rename it')).toBeTruthy();
  });

  it('keeps fields the schema does not know about, editable as YAML', async () => {
    const { apply, user } = setup({ ...component, futureField: { a: 1 } });
    expect(screen.getByText('not in schema')).toBeTruthy();
    const raw = screen.getByDisplayValue('a: 1');
    await user.clear(raw);
    await user.type(raw, 'a: 2');
    await user.tab();
    expect(apply).toHaveBeenCalledWith([
      { op: 'set', pointer: '/entries/0/futureField', value: { a: 2 } },
    ]);
  });

  describe('open-set fields like kind', () => {
    const kindPointer = '/entries/0/kind';
    const usage = () =>
      new Map([
        ['component', 2],
        ['acme.widget', 1],
      ]);
    const kindField = () => document.getElementById(kindPointer) as HTMLInputElement;
    const group = (heading: string) =>
      within(
        within(screen.getByRole('listbox'))
          .getByText(heading)
          .closest('[data-slot=combobox-group]') as HTMLElement,
      );
    const labels = (w: ReturnType<typeof within>) =>
      w.getAllByRole('option').map((o: HTMLElement) => o.textContent);

    it('shows the current value and groups standard values apart from custom ones in use', async () => {
      const { user } = setup(component, { usage });
      expect(kindField().value).toBe('component');
      await user.click(kindField());
      expect(labels(group('Standard'))).toEqual(
        expect.arrayContaining(['system', 'component2 in use']),
      );
      // A custom kind is shown by its own name; its namespace stays out of sight.
      expect(labels(group('Custom, in use'))).toEqual(['Widget1 in use']);
    });

    it('commits a standard or already used value', async () => {
      const { apply, user } = setup(component, { usage });
      await user.click(kindField());
      await user.click(screen.getByRole('option', { name: /Widget/ }));
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: kindPointer, value: 'acme.widget' },
      ]);
    });

    it('shows a custom kind by its own name', () => {
      setup({ ...component, kind: 'acme.my-widget' }, { usage });
      expect(kindField().value).toBe('My widget');
    });

    it('stores a plain name typed as a new kind with the project namespace', async () => {
      const { apply, user } = setup(component, { usage });
      await user.clear(kindField());
      await user.type(kindField(), 'Release notes');
      await user.click(screen.getByRole('option', { name: 'Use “Release notes”' }));
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: kindPointer, value: 'acme.release-notes' },
      ]);
    });

    it('does not offer to create a name that an existing custom kind already has', async () => {
      const { apply, user } = setup(component, { usage });
      await user.clear(kindField());
      await user.type(kindField(), 'widget');
      expect(screen.queryByRole('option', { name: /^Use / })).toBeNull();
      await user.click(screen.getByRole('option', { name: /Widget/ }));
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: kindPointer, value: 'acme.widget' },
      ]);
    });

    it('filters while typing, and still takes a new value that is not listed anywhere', async () => {
      const { apply, user } = setup(component, { usage });
      await user.clear(kindField());
      await user.type(kindField(), 'acme.');
      expect(labels(within(screen.getByRole('listbox')))).toEqual([
        'Widget1 in use',
        'Use “acme.”',
      ]);
      await user.type(kindField(), 'fresh');
      await user.click(screen.getByRole('option', { name: 'Use “acme.fresh”' }));
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: kindPointer, value: 'acme.fresh' },
      ]);
    });

    it('does not offer to create a value that already exists', async () => {
      const { user } = setup(component, { usage });
      await user.clear(kindField());
      await user.type(kindField(), 'acme.widget');
      expect(screen.queryByRole('option', { name: /^Use / })).toBeNull();
    });

    it('commits the highlighted row on Enter', async () => {
      const { apply, user } = setup(component, { usage });
      await user.clear(kindField());
      await user.type(kindField(), 'acme.fresh{Enter}');
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: kindPointer, value: 'acme.fresh' },
      ]);
    });

    it('does not wipe the saved value just because the text was emptied', async () => {
      const { apply, user } = setup(component, { usage });
      await user.clear(kindField());
      await user.tab();
      expect(apply).not.toHaveBeenCalled();
      expect(kindField().value).toBe('component');
    });

    it('keeps the saved value when the typed text is abandoned', async () => {
      const { apply, user } = setup(component, { usage });
      await user.clear(kindField());
      await user.type(kindField(), 'half-typed');
      await user.tab();
      expect(apply).not.toHaveBeenCalled();
      expect(kindField().value).toBe('component');
    });
  });

  describe('ref target picker', () => {
    const withRef = { ...component, uses: [{ to: 'nowhere' }] };
    const targets = [
      { target: 'color.action', label: 'Action' },
      { target: 'color.action#hover', label: 'hover' },
    ];
    const toPointer = '/entries/0/uses/0/to';
    const picker = () => document.getElementById(toPointer) as HTMLInputElement;

    it('warns when the target is not in the project', () => {
      setup(withRef, { targets });
      expect(screen.getByText('Not found in this project.')).toBeTruthy();
    });

    it('offers the project targets and commits the chosen one', async () => {
      const { apply, user } = setup(withRef, { targets });
      expect(picker().value).toBe('nowhere');
      await user.click(picker());
      expect(
        within(screen.getByRole('listbox'))
          .getAllByRole('option')
          .map((o: HTMLElement) => o.textContent),
      ).toEqual(['color.actionAction', 'color.action#hoverhover']);
      await user.click(screen.getByRole('option', { name: /color\.action#hover/ }));
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: toPointer, value: 'color.action#hover' },
      ]);
    });

    it('matches on the label too, and accepts a target outside the project', async () => {
      const { apply, user } = setup(withRef, { targets });
      await user.clear(picker());
      await user.type(picker(), 'hover');
      expect(
        within(screen.getByRole('listbox'))
          .getAllByRole('option')
          .map((o: HTMLElement) => o.textContent),
      ).toEqual(['color.action#hoverhover', 'Use “hover”']);
      await user.clear(picker());
      await user.type(picker(), 'other.entry');
      expect(
        within(screen.getByRole('listbox'))
          .getAllByRole('option')
          .map((o: HTMLElement) => o.textContent),
      ).toEqual(['Use “other.entry”']);
      await user.click(screen.getByRole('option'));
      expect(apply).toHaveBeenCalledWith([{ op: 'set', pointer: toPointer, value: 'other.entry' }]);
    });
  });

  describe('a same-as pointer: only items of the same section kind (Processing §4, DSDS-25)', () => {
    const targets = [
      { target: 'shared-a11y', label: 'Shared accessibility', type: 'entry' },
      {
        target: 'shared-a11y#touch-target',
        label: 'touch-target',
        type: 'item',
        sectionKind: 'guidelines',
      },
      { target: 'shared-a11y#focus', label: 'focus', type: 'item', sectionKind: 'guidelines' },
      { target: 'shared-a11y#target', label: 'target', type: 'item', sectionKind: 'definitions' },
      { target: 'button#variant', label: 'variant', type: 'trait' },
    ];
    const sameAs = (to: string, kind = 'guidelines') => ({
      ...component,
      sections: [
        {
          kind,
          for: 'all',
          items: [{ level: 'must', refs: [{ rel: 'same-as', to }] }],
        },
      ],
    });
    const toPointer = '/entries/0/sections/0/items/0/refs/0/to';
    const picker = () => document.getElementById(toPointer) as HTMLInputElement;
    const options = () =>
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o: HTMLElement) => o.textContent);

    it('offers only the items of the same kind as the item that reuses them', async () => {
      const { user } = setup(sameAs('nowhere'), { targets });
      await user.click(picker());
      expect(options()).toEqual(['shared-a11y#touch-targettouch-target', 'shared-a11y#focusfocus']);
    });

    it('offers definitions to a definition, and says why the list is short', async () => {
      const { user } = setup(sameAs('nowhere', 'definitions'), { targets });
      expect(screen.getByText(/Only definitions items can be reused here/)).toBeTruthy();
      await user.click(picker());
      expect(options()).toEqual(['shared-a11y#targettarget']);
    });

    it('still takes a target typed in, such as one in another document', async () => {
      const { apply, user } = setup(sameAs('nowhere'), { targets });
      await user.clear(picker());
      await user.type(picker(), 'other#rule');
      await user.click(screen.getByRole('option', { name: 'Use “other#rule”' }));
      expect(apply).toHaveBeenCalledWith([{ op: 'set', pointer: toPointer, value: 'other#rule' }]);
    });

    it('warns about a target of the wrong kind that is already there', () => {
      setup(sameAs('shared-a11y#target'), { targets });
      expect(screen.getByText(/not a guidelines item/i)).toBeTruthy();
    });

    it('does not warn about a target of the right kind', () => {
      setup(sameAs('shared-a11y#focus'), { targets });
      expect(screen.queryByText(/not a guidelines item/i)).toBeNull();
    });

    it('leaves other pointers alone: a `uses` pointer may name any entry or item', async () => {
      const { user } = setup({ ...component, uses: [{ to: 'nowhere' }] }, { targets });
      await user.click(document.getElementById('/entries/0/uses/0/to') as HTMLElement);
      expect(options()).toHaveLength(targets.length);
    });
  });

  describe('a reusing item shows the content it reuses (Processing §4)', () => {
    const reusing = {
      ...component,
      sections: [
        {
          kind: 'guidelines',
          for: 'all',
          items: [{ refs: [{ rel: 'same-as', to: 'shared-a11y#touch-target' }] }],
        },
      ],
    };
    const itemPointer = '/entries/0/sections/0/items/0';
    const effective: ResolvedItem = {
      address: 'touch-target',
      type: 'item',
      pointer: '/sections/0/items/0',
      reuses: 'shared-a11y#touch-target',
      origin: 'shared-a11y#touch-target',
      content: { level: 'must', statement: 'Touch targets are at least 44 points.' },
    };
    const reused = (pointer: string) => (pointer === itemPointer ? effective : undefined);
    const headWith = (text: string) =>
      [...document.querySelectorAll<HTMLElement>('.list-item-head .link-button')].find((h) =>
        h.textContent?.includes(text),
      );

    it('shows the reused level and statement where an item states none of its own', () => {
      setup(reusing, { reused });
      const items = [...document.querySelectorAll('.list-item-head .link-button')];
      const text = items.map((i) => i.textContent).join('|');
      expect(text).toMatch(/MUST:\s+Touch targets are at least 44 points\./);
    });

    it('says in the item that the content comes from elsewhere, and from where', () => {
      setup(reusing, { reused });
      expect(screen.getByText(/Reuses shared-a11y#touch-target/)).toBeTruthy();
      expect(
        screen.getByText(/Touch targets are at least 44 points\./, {
          selector: '.reused-content *',
        }),
      ).toBeTruthy();
    });

    it("lets an item's own fields win over what it reuses", () => {
      const own = {
        ...reusing,
        sections: [
          {
            kind: 'guidelines',
            for: 'all',
            items: [
              {
                level: 'must',
                statement: 'Our own wording.',
                refs: [{ rel: 'same-as', to: 'shared-a11y#touch-target' }],
              },
            ],
          },
        ],
      };
      setup(own, { reused });
      expect(headWith('Our own wording')?.textContent).toMatch(/MUST:\s+Our own wording\./);
    });

    it('shows nothing extra for an item that reuses nothing', () => {
      setup(component, { reused: () => undefined });
      expect(document.querySelector('.reused-content')).toBeNull();
    });
  });

  describe("an entry's id (published ids should not change: Specification §3.1)", () => {
    const idPointer = '/entries/0/id';
    const idField = () => document.getElementById(idPointer) as HTMLInputElement;

    it('asks first when the id changes, and applies the change only once told to', async () => {
      const requestIdChange = vi.fn();
      const { apply, user } = setup(component, { requestIdChange });
      await user.clear(idField());
      await user.type(idField(), 'push-button');
      await user.tab();
      expect(requestIdChange).toHaveBeenCalledWith('button', 'push-button', {
        pointer: idPointer,
        commit: expect.any(Function),
        cancel: expect.any(Function),
      });
      expect(apply).not.toHaveBeenCalled();
      requestIdChange.mock.calls[0]?.[2].commit();
      expect(apply).toHaveBeenCalledWith([{ op: 'set', pointer: idPointer, value: 'push-button' }]);
    });

    it('puts the old id back in the field when the change is cancelled', async () => {
      const requestIdChange = vi.fn();
      const { apply, user } = setup(component, { requestIdChange });
      await user.clear(idField());
      await user.type(idField(), 'push-button');
      await user.tab();
      act(() => requestIdChange.mock.calls[0]?.[2].cancel());
      expect(idField().value).toBe('button');
      expect(apply).not.toHaveBeenCalled();
    });

    it('does not ask when nothing changed', async () => {
      const requestIdChange = vi.fn();
      const { user } = setup(component, { requestIdChange });
      await user.click(idField());
      await user.tab();
      expect(requestIdChange).not.toHaveBeenCalled();
    });

    it('leaves the ids of items inside an entry alone: they are not entry ids', async () => {
      const requestIdChange = vi.fn();
      const { apply, user } = setup(
        {
          ...component,
          sections: [
            {
              kind: 'guidelines',
              for: 'all',
              items: [{ id: 'rule', level: 'must', statement: 'A.' }],
            },
          ],
        },
        { requestIdChange },
      );
      const item = document.getElementById('/entries/0/sections/0/items/0/id') as HTMLInputElement;
      await user.clear(item);
      await user.type(item, 'other');
      await user.tab();
      expect(requestIdChange).not.toHaveBeenCalled();
      expect(apply).toHaveBeenCalled();
    });
  });

  describe('a deprecated trait value shows what replaces it (Processing §7)', () => {
    const withTrait = {
      ...component,
      traits: [
        { id: 'size', traitType: 'variant', kind: 'enum', values: [{ id: 'big', name: 'Big' }] },
      ],
    };
    const succession = (pointer: string) =>
      pointer === '/entries/0/traits/0'
        ? { replacedBy: ['button#size.large'], successors: ['button#size.large'], choose: false }
        : undefined;
    const head = () =>
      [...document.querySelectorAll<HTMLElement>('.list-item-head .link-button')].find((h) =>
        h.textContent?.includes('size'),
      );

    it('flags the item and says what replaces it', () => {
      setup(withTrait, { succession });
      expect(head()?.textContent).toContain('replaced');
      expect(screen.getByText(/Replaced by button#size\.large/)).toBeTruthy();
    });

    it('says so when there are several successors, and does not pick one', () => {
      setup(withTrait, {
        succession: () => ({ replacedBy: ['a', 'b'], successors: ['a', 'b'], choose: true }),
      });
      expect(screen.getAllByText(/more than one successor/i).length).toBeGreaterThan(0);
    });

    it('shows nothing for an item that is not replaced', () => {
      setup(withTrait, { succession: () => undefined });
      expect(screen.queryByText(/Replaced by/)).toBeNull();
    });
  });

  describe('removing optional fields', () => {
    const withMeta = { ...component, metadata: { group: 'actions', tags: ['a', 'b'] } };

    it('removes a simple optional field with one click', async () => {
      const { apply, user } = setup(withMeta);
      await user.click(screen.getByLabelText('Remove group'));
      expect(apply).toHaveBeenCalledWith([{ op: 'remove', pointer: '/entries/0/metadata/group' }]);
    });

    it('never offers to remove a required field', () => {
      setup(component);
      for (const required of ['kind', 'id', 'name', 'description']) {
        expect(screen.queryByLabelText(`Remove ${required}`)).toBeNull();
      }
    });

    it('asks first when the field holds nested content, then removes it', async () => {
      const { apply, user } = setup(withMeta);
      await user.click(screen.getByLabelText('Remove metadata'));
      expect(apply).not.toHaveBeenCalled();
      expect(screen.getByText('Removes metadata and everything in it')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(apply).toHaveBeenCalledWith([{ op: 'remove', pointer: '/entries/0/metadata' }]);
    });

    it('cancelling leaves the field alone', async () => {
      const { apply, user } = setup(withMeta);
      await user.click(screen.getByLabelText('Remove sections'));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(apply).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Remove sections')).toBeTruthy();
    });

    it('can remove a field the schema does not know about', async () => {
      const { apply, user } = setup({ ...component, futureField: 'x' });
      await user.click(screen.getByLabelText('Remove futureField'));
      expect(apply).toHaveBeenCalledWith([{ op: 'remove', pointer: '/entries/0/futureField' }]);
    });
  });

  describe('dsds: link suggestions in Markdown fields', () => {
    const targets = [
      { target: 'link', label: 'Link' },
      { target: 'link#states', label: 'states' },
      { target: 'dialog', label: 'Dialog' },
    ];

    it('offers project targets after "<dsds:" and inserts the chosen one', async () => {
      const { apply, user } = setup({ ...component, description: '' }, { targets });
      const box = screen.getByLabelText(/^description/, { selector: 'textarea' });
      await user.click(box);
      await user.type(box, 'Use <dsds:li');
      const list = screen.getByRole('listbox', { name: 'Link targets' });
      expect(
        within(list)
          .getAllByRole('option')
          .map((o: HTMLElement) => o.textContent),
      ).toEqual(['linkLink', 'link#statesstates']);
      await user.keyboard('{ArrowDown}{Enter}');
      expect((box as HTMLTextAreaElement).value).toBe('Use <dsds:link#states');
      expect(screen.queryByRole('listbox')).toBeNull();
      await user.tab();
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: '/entries/0/description', value: 'Use <dsds:link#states' },
      ]);
    });

    it('offers targets for a link written with a capitalised scheme', async () => {
      const { user } = setup({ ...component, description: '' }, { targets });
      const box = screen.getByLabelText(/^description/, { selector: 'textarea' });
      await user.click(box);
      await user.type(box, 'Use <DSDS:li');
      expect(screen.getByRole('listbox', { name: 'Link targets' })).toBeTruthy();
    });

    it('stays closed inside an inline code span, and opens again after it', async () => {
      const { user } = setup({ ...component, description: '' }, { targets });
      const box = screen.getByLabelText(/^description/, { selector: 'textarea' });
      await user.click(box);
      // A span with its closing backtick already there, and the caret inside it.
      await user.type(box, 'Write ``{ArrowLeft}<dsds:li');
      expect(screen.queryByRole('listbox')).toBeNull();
      await user.keyboard('{End} then <dsds:li');
      expect(screen.getByRole('listbox', { name: 'Link targets' })).toBeTruthy();
    });

    it('stays closed inside a fenced code block, and opens again after it', async () => {
      const { user } = setup({ ...component, description: '' }, { targets });
      const box = screen.getByLabelText(/^description/, { selector: 'textarea' });
      await user.click(box);
      await user.type(box, '```{Enter}<dsds:li');
      expect(screen.queryByRole('listbox')).toBeNull();
      await user.type(box, '{Enter}```{Enter}See <dsds:li');
      expect(screen.getByRole('listbox', { name: 'Link targets' })).toBeTruthy();
    });

    it('stays closed in ordinary text and closes on Escape', async () => {
      const { user } = setup({ ...component, description: '' }, { targets });
      const box = screen.getByLabelText(/^description/, { selector: 'textarea' });
      await user.click(box);
      await user.type(box, 'no links here');
      expect(screen.queryByRole('listbox')).toBeNull();
      await user.type(box, ' <dsds:');
      expect(screen.getByRole('listbox')).toBeTruthy();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).toBeNull();
    });
  });
});
