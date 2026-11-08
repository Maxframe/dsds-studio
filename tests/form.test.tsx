// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchemaBundle, effective, nodeOf, propertyOf, type JsonSchema } from '@shared/schema';
import type { EditOp, Finding } from '@shared/types';
import { FormProvider, type FormContext } from '../src/web/form/context';
import { SchemaField } from '../src/web/form/SchemaField';
import './dom-polyfills';
import { optionsOf } from './select';
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

describe('schema-driven form', () => {
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
      expect(labels(group('Custom, in use'))).toEqual(['acme.widget1 in use']);
    });

    it('commits a standard or already used value', async () => {
      const { apply, user } = setup(component, { usage });
      await user.click(kindField());
      await user.click(screen.getByRole('option', { name: /acme\.widget/ }));
      expect(apply).toHaveBeenCalledWith([
        { op: 'set', pointer: kindPointer, value: 'acme.widget' },
      ]);
    });

    it('filters while typing, and still takes a new value that is not listed anywhere', async () => {
      const { apply, user } = setup(component, { usage });
      await user.clear(kindField());
      await user.type(kindField(), 'acme.');
      expect(labels(within(screen.getByRole('listbox')))).toEqual([
        'acme.widget1 in use',
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
