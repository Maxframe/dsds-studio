// @vitest-environment jsdom
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '@server/api';
import { SnapshotStore } from '@server/projects/snapshots';
import { Workspace } from '@server/workspace';
import { App } from '../src/web/App';
import './dom-polyfills';
import { iconButtonsMissingHints, iconOnlyButtons } from './icon-buttons';
import { choose } from './select';

// Renders the whole app against the real API, so a runtime error anywhere on the way from the
// project picker to the entry form (a bad import, a crash in the renderer) fails `npm run check`
// instead of showing up as a blank page.
let ws: Workspace;
beforeEach(() => {
  ws = new Workspace(mkdtempSync(join(tmpdir(), 'dsds-app-')));
  const api = createApi(ws);
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => api.request(url, init));
  location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The general "+" next to Files: pick a kind in the combobox, name it, create. */
async function addEntry(user: ReturnType<typeof userEvent.setup>, kind: string, name: string) {
  await user.click(await screen.findByRole('button', { name: 'New entry' }));
  await user.click(screen.getByPlaceholderText('Select or type a kind'));
  await user.click(screen.getByRole('option', { name: kind }));
  await user.type(screen.getByLabelText('Entry name'), name);
  await user.click(screen.getByRole('button', { name: 'Create' }));
}

/** Open an entry's "more" menu in the tree and click one of its items. */
async function menuAction(user: ReturnType<typeof userEvent.setup>, entry: string, item: string) {
  await user.click(await screen.findByRole('button', { name: `More actions for ${entry}` }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

async function openNewProject(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.type(await screen.findByLabelText('Design system name'), 'Demo System');
  await user.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(
    () => expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
    {
      timeout: 5000,
    },
  );
}
/** A project where entries point at each other: a component uses a token and reuses a shared rule. */
const REFS_BASE = `schemaVersion: "0.23.1"
name: Demo System
entries:
  - kind: system
    id: demo-system
    name: Demo System
    description: A system.
  - kind: token
    id: color.action
    name: Action colour
    description: The action colour.
    tokenType: color
  - kind: component
    id: dialog
    name: Dialog
    description: A dialog.
    uses:
      - to: color.action
    sections:
      - kind: guidelines
        for: all
        items:
          - id: touch
            refs:
              - to: shared-a11y#touch-target
                rel: same-as
shared:
  - id: shared-a11y
    name: Shared accessibility
    description: Rules for everyone.
    sections:
      - kind: guidelines
        for: all
        items:
          - id: touch-target
            level: must
            statement: Touch targets are at least 44 points.
`;
async function openRefsProject(user: ReturnType<typeof userEvent.setup>) {
  await openNewProject(user);
  writeFileSync(join(ws.root, 'demo-system', 'demo-system.dsds.yaml'), REFS_BASE);
  await user.click(screen.getByRole('button', { name: 'Back to projects' }));
  await user.click(await screen.findByRole('button', { name: /demo-system/ }));
}

const yamlText = () => document.querySelector('.cm-content')?.textContent ?? '';

describe('app', () => {
  it('creates a project and shows its first entry as an editable form', async () => {
    const user = userEvent.setup();
    const errors = vi.spyOn(console, 'error');
    render(<App />);

    await user.type(await screen.findByLabelText('Design system name'), 'Demo System');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // The project view loads the schema pack, the file and the validation result.
    await waitFor(
      () => expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
      {
        timeout: 5000,
      },
    );
    expect(screen.getAllByText('description', { selector: 'label' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/0 errors, 0 warnings/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New entry' })).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });

  it('shows a "New entry" row, then a "Base" row, ahead of the kind groups', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    expect(screen.queryByRole('heading', { name: 'Files' })).toBeNull();
    const add = await screen.findByRole('button', { name: 'New entry' });
    const base = screen.getByRole('button', { name: 'Base' });
    const system = screen.getByRole('group', { name: 'system' });
    const before = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(add.compareDocumentPosition(base) & before).toBeTruthy();
    expect(base.compareDocumentPosition(system) & before).toBeTruthy();
    // The row has a file icon like the "New entry" row has a plus; the file it stands for is its tooltip.
    expect(base.querySelector('svg')).toBeTruthy();
    expect(base.getAttribute('title')).toBe('demo-system.dsds.yaml');
  });

  it('offers to declare platforms when a project is created, and shows what will be saved', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Design system name'), 'Demo System');
    await user.type(screen.getByLabelText('Platforms (optional)'), 'React Native, iOS');
    expect(screen.getByText('Saved as: react-native, ios')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(
      () => expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
    const text = readFileSync(join(ws.root, 'demo-system', 'demo-system.dsds.yaml'), 'utf8');
    expect(text).toMatch(/platforms:\s*\[?\s*react-native,\s*ios/);
    expect(await screen.findByText(/0 errors/)).toBeTruthy();
  });

  it('creates a project with no platforms when the field is left empty', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    const text = readFileSync(join(ws.root, 'demo-system', 'demo-system.dsds.yaml'), 'utf8');
    expect(text).not.toContain('platforms');
  });

  it('lists existing projects on the first screen', async () => {
    render(<App />);
    expect(await screen.findByText('No projects yet. Create one below.')).toBeTruthy();
  });

  it('shows the file as YAML next to the form and keeps it in sync with form edits', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await waitFor(() => expect(yamlText()).toContain('schemaVersion'));
    const name = screen.getAllByDisplayValue('Demo System')[0] as HTMLElement;
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.tab();
    await waitFor(() => expect(yamlText()).toContain('name: Renamed'), { timeout: 5000 });
  });

  it('collapses and expands a kind group in the tree', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await addEntry(user, 'component', 'Button');
    await screen.findByRole('button', { name: 'More actions for Button' }, { timeout: 5000 });
    const group = screen.getByRole('button', { name: 'component' });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    await user.click(group);
    expect(screen.queryByRole('button', { name: 'More actions for Button' })).toBeNull();
    await user.click(group);
    expect(screen.getByRole('button', { name: 'More actions for Button' })).toBeTruthy();
  });

  it('settings change the colour scheme, theme, radius and field help and are remembered', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    await openNewProject(user);
    const root = document.documentElement;
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('radio', { name: 'Color scheme: dark' }));
    await user.click(screen.getByRole('radio', { name: 'Corner radius: large' }));
    await choose(user, screen.getByRole('combobox', { name: 'Theme' }), 'Stone');
    await user.click(screen.getByRole('radio', { name: 'Field help: icon' }));
    expect(root.getAttribute('data-help')).toBe('icon');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-radius')).toBe('large');
    expect(root.getAttribute('data-base')).toBe('stone');
    expect(JSON.parse(localStorage.getItem('dsds-studio.settings') ?? '{}')).toEqual({
      scheme: 'dark',
      base: 'stone',
      radius: 'large',
      help: 'icon',
    });
    await user.click(screen.getByRole('radio', { name: 'Color scheme: system' }));
    expect(root.hasAttribute('data-theme')).toBe(false);
    localStorage.clear();
    for (const a of ['data-theme', 'data-base', 'data-radius', 'data-help'])
      root.removeAttribute(a);
  });

  it('shows the draft since the last version and discards it on request', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    // A new project starts at its first version: nothing to save.
    expect(await screen.findByText('No unsaved changes')).toBeTruthy();
    const name = screen.getAllByDisplayValue('Demo System')[0] as HTMLElement;
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.tab();
    expect(await screen.findByText('Draft: 1 file changed', {}, { timeout: 5000 })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByText(/A copy of the changes is kept in the history/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('No unsaved changes', {}, { timeout: 5000 })).toBeTruthy();
    // The form shows the file as it was in the last version.
    await waitFor(() =>
      expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
    );
    expect(screen.queryByDisplayValue('Renamed')).toBeNull();
  });

  async function editName(user: ReturnType<typeof userEvent.setup>, value: string) {
    const name = document.getElementById('/entries/0/name') as HTMLElement;
    await user.clear(name);
    await user.type(name, value);
    await user.tab();
    await screen.findByText('Draft: 1 file changed', {}, { timeout: 5000 });
  }
  const store = () => new SnapshotStore(join(ws.root, 'demo-system'));
  /** Version labels, newest first, one per line. */
  const versionLog = () =>
    `${store()
      .list()
      .map((m) => m.label)
      .join('\n')}\n`;
  const tags = () =>
    store()
      .list()
      .flatMap((m) => m.tags)
      .join('\n');

  it('quicksaves the draft from the button and from Ctrl+S', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'One');
    await user.click(screen.getByRole('button', { name: 'Quicksave' }));
    expect(await screen.findByText('No unsaved changes', {}, { timeout: 5000 })).toBeTruthy();
    expect(versionLog()).toMatch(/^Quicksave /);
    await editName(user, 'Two');
    await user.keyboard('{Control>}s{/Control}');
    expect(await screen.findByText('No unsaved changes', {}, { timeout: 5000 })).toBeTruthy();
    expect(
      versionLog()
        .split('\n')
        .filter((l) => l.startsWith('Quicksave')),
    ).toHaveLength(2);
  });

  it('saves a named version with a tag, and shows why a tag is refused', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'One');
    await user.click(screen.getByRole('button', { name: 'Save version…' }));
    await user.type(screen.getByLabelText('Version label'), 'First release');
    await user.type(screen.getByLabelText(/^Tag/), 'not a tag');
    await user.click(screen.getByRole('button', { name: 'Save version' }));
    expect(await screen.findByText(/is not a valid tag name/)).toBeTruthy();
    // The draft is untouched by the refused save.
    expect(screen.getByText('Draft: 1 file changed')).toBeTruthy();
    await user.clear(screen.getByLabelText(/^Tag/));
    await user.type(screen.getByLabelText(/^Tag/), 'v1.0.0');
    await user.click(screen.getByRole('button', { name: 'Save version' }));
    expect(await screen.findByText('No unsaved changes', {}, { timeout: 5000 })).toBeTruthy();
    expect(versionLog()).toMatch(/^First release/);
    expect(tags()).toContain('v1.0.0');
  });

  it('lists the history with quicksaves folded away, and names and tags versions', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'One');
    await user.click(screen.getByRole('button', { name: 'Quicksave' }));
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'History' }));
    // Named versions show; the quicksave is folded away until asked for.
    expect(await screen.findByText('Initial version')).toBeTruthy();
    expect(screen.queryByText(/^Quicksave \d/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show 1 quicksave' }));
    expect(screen.getByText(/^Quicksave \d/)).toBeTruthy();

    // Name it later: it becomes a named version.
    await user.click(screen.getByRole('button', { name: 'Name' }));
    await user.type(screen.getByLabelText('Version name'), 'Hero work{Enter}');
    expect(await screen.findByText('Hero work')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Name' })).toBeNull();

    // Tag it: a bad name is explained, a good one shows as a badge.
    await user.click(screen.getByRole('button', { name: 'Tag Hero work' }));
    await user.type(screen.getByLabelText('Tag name'), 'bad name{Enter}');
    expect(await screen.findByText(/is not a valid tag name/)).toBeTruthy();
    await user.clear(screen.getByLabelText('Tag name'));
    await user.type(screen.getByLabelText('Tag name'), 'v1{Enter}');
    expect(await screen.findByText('v1')).toBeTruthy();
    expect(tags()).toContain('v1');
  });

  it('reviews the draft entry by entry, and compares an earlier version from the history', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'Reviewed');
    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Changes since the last version')).toBeTruthy();
    expect(dialog.querySelector('strong')?.textContent).toBe('Reviewed'); // the entry's name
    expect(within(dialog).getByText('Changed')).toBeTruthy();
    expect(within(dialog).getByText('/name')).toBeTruthy();
    expect(within(dialog).getAllByText('Demo System').length).toBeGreaterThan(0); // the old value
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // After saving, the same change is found by comparing the first version from the history.
    await user.click(screen.getByRole('button', { name: 'Quicksave' }));
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'History' }));
    await user.click(await screen.findByRole('button', { name: 'Compare Initial version' }));
    const again = await screen.findByRole('dialog');
    expect(await within(again).findByText('Changes since Initial version')).toBeTruthy();
    expect(within(again).getByText('/name')).toBeTruthy();
  });

  it('says so when there are no differences to review', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'Temp');
    await editName(user, 'Demo System');
    // Back to the saved content: the draft still lists the file, but the comparison finds nothing.
    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(
      await within(await screen.findByRole('dialog')).findByText('No differences.'),
    ).toBeTruthy();
  });

  it('restores an earlier version as a new one, with nothing unsaved', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'One');
    await user.click(screen.getByRole('button', { name: 'Quicksave' }));
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'History' }));
    // The newest version has nothing to restore; an older one does.
    expect(screen.queryByRole('button', { name: /^Restore Quicksave/ })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Restore Initial version' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Restore “Initial version”\?/)).toBeTruthy();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    // The form shows the restored content, and history gained a version instead of losing one.
    await waitFor(
      () => expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
      {
        timeout: 5000,
      },
    );
    expect(versionLog().split('\n')[0]).toBe('Restored “Initial version”');
    expect(versionLog().trim().split('\n')).toHaveLength(3);
  });

  it('asks what to do with unsaved changes before restoring', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'One');
    await user.click(screen.getByRole('button', { name: 'Quicksave' }));
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    await editName(user, 'Unsaved');
    const open = async () => {
      await user.click(screen.getByRole('button', { name: 'History' }));
      await user.click(await screen.findByRole('button', { name: 'Restore Initial version' }));
      return screen.findByRole('dialog');
    };

    // Cancel changes nothing.
    let dialog = await open();
    expect(within(dialog).getByRole('alert').textContent).toMatch(/unsaved changes in 1 file/);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Draft: 1 file changed')).toBeTruthy();

    // Quicksave and restore keeps the unsaved work as a version.
    dialog = await open();
    await user.click(within(dialog).getByRole('button', { name: 'Quicksave and restore' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    const log = versionLog().trim().split('\n');
    expect(log[0]).toBe('Restored “Initial version”');
    expect(log[1]).toMatch(/^Quicksave /);
  });

  it('discards unsaved changes and restores when asked to', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await editName(user, 'One');
    await user.click(screen.getByRole('button', { name: 'Quicksave' }));
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    await editName(user, 'Unsaved');
    await user.click(screen.getByRole('button', { name: 'History' }));
    await user.click(await screen.findByRole('button', { name: 'Restore Initial version' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Discard and restore',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    await waitFor(
      () => expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
      {
        timeout: 5000,
      },
    );
    expect(screen.queryByDisplayValue('Unsaved')).toBeNull();
    // The discarded work is still recoverable: it is an automatic version in the history.
    expect(versionLog()).toContain('Before discarding changes');
  });

  it('stamps the changed entries with today’s date when saving a named version, unless unchecked', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    const base = join(ws.root, 'demo-system', 'demo-system.dsds.yaml');
    await editName(user, 'One');
    await user.click(screen.getByRole('button', { name: 'Save version…' }));
    const stamp = screen.getByRole('checkbox', { name: /Stamp changed entries/ });
    expect(stamp.getAttribute('aria-checked')).toBe('true');
    await user.type(screen.getByLabelText('Version label'), 'Stamped');
    await user.click(screen.getByRole('button', { name: 'Save version' }));
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    const text = readFileSync(base, 'utf8');
    expect(text).toMatch(/updated:\s*\n?\s*date: "?\d{4}-\d{2}-\d{2}/);
    expect(text).toContain('note: Stamped');
    // The form was reloaded from the stamped file: the new field is on screen.
    await waitFor(() => expect(screen.getAllByText('updated').length).toBeGreaterThan(0), {
      timeout: 5000,
    });

    await editName(user, 'Two');
    await user.click(screen.getByRole('button', { name: 'Save version…' }));
    await user.click(screen.getByRole('checkbox', { name: /Stamp changed entries/ }));
    await user.type(screen.getByLabelText('Version label'), 'Plain');
    await user.click(screen.getByRole('button', { name: 'Save version' }));
    await screen.findByText('No unsaved changes', {}, { timeout: 5000 });
    expect(readFileSync(base, 'utf8')).toContain('note: Stamped'); // untouched by the second save
  });

  it('gives every icon button in the project view a name and a hover hint', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await addEntry(user, 'component', 'Button');
    await screen.findByRole('button', { name: 'More actions for Button' }, { timeout: 5000 });
    const toolbar = ['Back to projects', 'Settings', 'Hide code panel'];
    for (const name of toolbar) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(iconOnlyButtons().length).toBeGreaterThanOrEqual(8);
    expect(iconButtonsMissingHints()).toEqual([]);

    // Overlays are part of the app too: the history popover and the add panel.
    await user.click(screen.getByRole('button', { name: 'History' }));
    await screen.findByText('Initial version');
    expect(iconButtonsMissingHints()).toEqual([]);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'New entry' }));
    expect(iconButtonsMissingHints()).toEqual([]);
  });

  it('shows a tooltip when a toolbar icon button is hovered', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await user.hover(screen.getByRole('button', { name: 'Settings' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Settings');
  });

  describe('new entries go where the style guide puts their kind', () => {
    const idsInFile = () => {
      const text = readFileSync(join(ws.root, 'demo-system', 'demo-system.dsds.yaml'), 'utf8');
      return [...text.matchAll(/^\s+id: (\S+)/gm)].map((m) => m[1]);
    };

    it('inserts by kind: system, token, theme, component, entry', async () => {
      const user = userEvent.setup();
      await openNewProject(user);
      await addEntry(user, 'component', 'Button');
      await screen.findByRole('button', { name: 'More actions for Button' }, { timeout: 5000 });
      await addEntry(user, 'theme', 'Dark');
      await screen.findByRole('button', { name: 'More actions for Dark' }, { timeout: 5000 });
      await addEntry(user, 'token', 'Red');
      await screen.findByRole('button', { name: 'More actions for Red' }, { timeout: 5000 });
      expect(idsInFile()).toEqual(['demo-system', 'red', 'dark', 'button']);
      // The entry just added is the one that opens, wherever it landed.
      expect(document.querySelector('.toolbar-heading')?.textContent).toBe('Red');
    });

    it('puts a copy next to the others of its kind, not at the very end', async () => {
      const user = userEvent.setup();
      await openNewProject(user);
      await addEntry(user, 'component', 'Button');
      await screen.findByRole('button', { name: 'More actions for Button' }, { timeout: 5000 });
      await addEntry(user, 'entry', 'Notes');
      await screen.findByRole('button', { name: 'More actions for Notes' }, { timeout: 5000 });
      await menuAction(user, 'Button', 'Duplicate');
      await screen.findByRole('button', { name: 'More actions for Button (copy)' });
      expect(idsInFile()).toEqual(['demo-system', 'button', 'button-copy', 'notes']);
    });
  });

  describe('custom kinds: the namespace is not for people to type', () => {
    const baseFile = () => join(ws.root, 'demo-system', 'demo-system.dsds.yaml');
    const kindsInFile = () =>
      [...readFileSync(baseFile(), 'utf8').matchAll(/^\s+- kind: (\S+)/gm)].map((m) => m[1]);
    const addCustom = async (
      user: ReturnType<typeof userEvent.setup>,
      kind: string,
      name: string,
    ) => {
      await user.click(await screen.findByRole('button', { name: 'New entry' }));
      await user.type(screen.getByPlaceholderText('Select or type a kind'), kind);
      await user.click(screen.getByRole('option', { name: `Use “${kind}”` }));
      await user.type(screen.getByLabelText('Entry name'), name);
      await user.click(screen.getByRole('button', { name: 'Create' }));
    };

    it('takes a plain name, stores it namespaced, and shows the plain name again', async () => {
      const user = userEvent.setup();
      await openNewProject(user);
      await addCustom(user, 'Reports', 'Q3 summary');
      await screen.findByRole('button', { name: 'More actions for Q3 summary' }, { timeout: 5000 });
      // Stored with the project's own namespace, so the schema accepts it...
      expect(kindsInFile()).toContain('demo-system.reports');
      expect(await screen.findByText(/0 errors/)).toBeTruthy();
      // ...and everywhere the person looks it is just "Reports".
      expect(screen.getByRole('group', { name: 'Reports' })).toBeTruthy();
      expect(screen.queryByText(/demo-system\.reports/, { selector: '.tree-group *' })).toBeNull();
      expect((document.getElementById('/entries/1/kind') as HTMLInputElement).value).toBe(
        'Reports',
      );
    });

    it('offers a custom kind already in use by its plain name, and does not create a twin', async () => {
      const user = userEvent.setup();
      await openNewProject(user);
      await addCustom(user, 'Reports', 'One');
      await screen.findByRole('button', { name: 'More actions for One' }, { timeout: 5000 });
      await user.click(screen.getByRole('button', { name: 'New entry' }));
      await user.type(screen.getByPlaceholderText('Select or type a kind'), 'reports');
      expect(screen.queryByRole('option', { name: /^Use / })).toBeNull();
      await user.click(screen.getByRole('option', { name: /^Reports/ }));
      await user.type(screen.getByLabelText('Entry name'), 'Two');
      await user.click(screen.getByRole('button', { name: 'Create' }));
      await screen.findByRole('button', { name: 'More actions for Two' }, { timeout: 5000 });
      expect(kindsInFile().filter((k) => k === 'demo-system.reports')).toHaveLength(2);
    });

    it('takes the namespace from the system entry id when no custom kind exists yet', async () => {
      const user = userEvent.setup();
      await openNewProject(user);
      // The project is called demo-system, but its system entry has an id of its own.
      writeFileSync(
        baseFile(),
        readFileSync(baseFile(), 'utf8').replace('id: demo-system', 'id: acme-design-system'),
      );
      await user.click(screen.getByRole('button', { name: 'Back to projects' }));
      await user.click(await screen.findByRole('button', { name: /demo-system/ }));
      await addCustom(user, 'Reports', 'Q3 summary');
      await screen.findByRole('button', { name: 'More actions for Q3 summary' }, { timeout: 5000 });
      expect(kindsInFile()).toContain('acme-design-system.reports');
      expect(kindsInFile()).not.toContain('demo-system.reports');
      expect(await screen.findByText(/0 errors/)).toBeTruthy();
    });

    it('reuses the namespace the project already has', async () => {
      const user = userEvent.setup();
      await openNewProject(user);
      writeFileSync(
        baseFile(),
        readFileSync(baseFile(), 'utf8') +
          '  - kind: acme.cards\n    id: cards\n    name: Cards\n    description: x\n',
      );
      await user.click(screen.getByRole('button', { name: 'Back to projects' }));
      await user.click(await screen.findByRole('button', { name: /demo-system/ }));
      await addCustom(user, 'Notes', 'Release notes');
      await screen.findByRole(
        'button',
        { name: 'More actions for Release notes' },
        { timeout: 5000 },
      );
      expect(kindsInFile()).toContain('acme.notes');
      expect(kindsInFile()).not.toContain('demo-system.notes');
    });
  });

  const SUCCESSION_BASE = `schemaVersion: "0.23.1"
name: Demo System
entries:
  - kind: system
    id: demo-system
    name: Demo System
    description: A system.
  - kind: component
    id: old-button
    name: Old button
    description: The first button.
    metadata:
      status:
        status: deprecated
        deprecationNotice: Use the mid button.
        replacedBy:
          - to: mid-button
  - kind: component
    id: mid-button
    name: Mid button
    description: The second button.
    metadata:
      status:
        status: deprecated
        deprecationNotice: Use the new button.
        replacedBy:
          - to: new-button
  - kind: component
    id: new-button
    name: New button
    description: The current button.
  - kind: component
    id: old-link
    name: Old link
    description: A link.
    metadata:
      status:
        status: deprecated
        deprecationNotice: Use either, depending on context.
        replacedBy:
          - to: new-button
          - to: new-link
  - kind: component
    id: new-link
    name: New link
    description: The current link.
`;

  describe('Replaced by: where a deprecated entry went (Processing §7)', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      await openNewProject(user);
      writeFileSync(join(ws.root, 'demo-system', 'demo-system.dsds.yaml'), SUCCESSION_BASE);
      await user.click(screen.getByRole('button', { name: 'Back to projects' }));
      await user.click(await screen.findByRole('button', { name: /demo-system/ }));
    };
    const panel = () => screen.findByRole('region', { name: 'Replaced by' }, { timeout: 5000 });

    it('names the replacement, and follows on when it is deprecated too', async () => {
      const user = userEvent.setup();
      await open(user);
      await user.click(await screen.findByRole('button', { name: 'Old button' }));
      const region = await panel();
      expect(within(region).getByRole('button', { name: 'Mid button' })).toBeTruthy();
      // Mid button is itself replaced: the end of the chain is shown, too.
      expect(within(region).getByText(/replaced as well/i)).toBeTruthy();
      expect(within(region).getByRole('button', { name: 'New button' })).toBeTruthy();
    });

    it('opens the replacement when it is clicked', async () => {
      const user = userEvent.setup();
      await open(user);
      await user.click(await screen.findByRole('button', { name: 'Old button' }));
      await user.click(within(await panel()).getByRole('button', { name: 'New button' }));
      await waitFor(() =>
        expect(document.querySelector('.toolbar-heading')?.textContent).toBe('New button'),
      );
    });

    it('does not choose between several replacements', async () => {
      const user = userEvent.setup();
      await open(user);
      await user.click(await screen.findByRole('button', { name: 'Old link' }));
      const region = await panel();
      expect(within(region).getByRole('button', { name: 'New button' })).toBeTruthy();
      expect(within(region).getByRole('button', { name: 'New link' })).toBeTruthy();
      expect(within(region).getByText(/more than one successor/i)).toBeTruthy();
      expect(within(region).getByText(/deprecation notice/i)).toBeTruthy();
    });

    it('shows nothing for an entry that is not replaced', async () => {
      const user = userEvent.setup();
      await open(user);
      await user.click(await screen.findByRole('button', { name: 'New button' }));
      await waitFor(() =>
        expect(document.querySelector('.toolbar-heading')?.textContent).toBe('New button'),
      );
      expect(screen.queryByRole('region', { name: 'Replaced by' })).toBeNull();
    });
  });

  describe('Used by: what points at an entry (Processing §5)', () => {
    const panel = () => screen.queryByRole('region', { name: 'Used by' });

    it('lists the entries that point at the open one, with how', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Action colour' }));
      const used = await screen.findByRole('region', { name: 'Used by' }, { timeout: 5000 });
      expect(within(used).getByRole('button', { name: /Dialog/ }).textContent).toMatch(
        /Dialog.*uses/,
      );
    });

    it('names the item that holds the pointer, and what it points at inside this entry', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Shared accessibility' }));
      const used = await screen.findByRole('region', { name: 'Used by' }, { timeout: 5000 });
      const row = within(used).getByRole('button', { name: /Dialog/ });
      expect(row.textContent).toMatch(/Dialog.*touch.*same-as.*touch-target/);
    });

    it('jumps to the pointer in the other entry', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Action colour' }));
      const used = await screen.findByRole('region', { name: 'Used by' }, { timeout: 5000 });
      await user.click(within(used).getByRole('button', { name: /Dialog/ }));
      await waitFor(() =>
        expect(document.querySelector('.toolbar-heading')?.textContent).toBe('Dialog'),
      );
      // The field that holds the pointer is the one in view and highlighted.
      expect(document.getElementById('/entries/2/uses/0/to')).toBeTruthy();
    });

    it('shows nothing for an entry nothing points at', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Dialog' }));
      await waitFor(() =>
        expect(document.querySelector('.toolbar-heading')?.textContent).toBe('Dialog'),
      );
      expect(panel()).toBeNull();
    });
  });

  describe('changing an entry id that other entries point at', () => {
    const baseFile = () => join(ws.root, 'demo-system', 'demo-system.dsds.yaml');
    const idInput = (pointer: string) => document.getElementById(pointer) as HTMLInputElement;
    const rename = async (
      user: ReturnType<typeof userEvent.setup>,
      pointer: string,
      id: string,
    ) => {
      await user.clear(idInput(pointer));
      await user.type(idInput(pointer), id);
      await user.tab();
    };

    it('asks first, saying what would break, and cancelling keeps the id', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Action colour' }));
      await screen.findByRole('region', { name: 'Used by' }, { timeout: 5000 });
      await rename(user, '/entries/1/id', 'color.primary');
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/1 place points at color\.action/)).toBeTruthy();
      expect(within(dialog).getByText(/change its name instead/i)).toBeTruthy();
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(idInput('/entries/1/id').value).toBe('color.action');
      expect(readFileSync(baseFile(), 'utf8')).toContain('id: color.action');
    });

    it('can change the id and update every pointer to it', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Action colour' }));
      await screen.findByRole('region', { name: 'Used by' }, { timeout: 5000 });
      await rename(user, '/entries/1/id', 'color.primary');
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Change id and update 1 pointer',
        }),
      );
      await waitFor(() => expect(readFileSync(baseFile(), 'utf8')).toContain('id: color.primary'), {
        timeout: 5000,
      });
      const text = readFileSync(baseFile(), 'utf8');
      expect(text).toContain('to: color.primary');
      expect(text).not.toContain('color.action');
      expect(await screen.findByText(/0 errors/)).toBeTruthy();
    });

    it('can change the id alone, leaving the pointers (a choice, with a warning shown)', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Action colour' }));
      await screen.findByRole('region', { name: 'Used by' }, { timeout: 5000 });
      await rename(user, '/entries/1/id', 'color.primary');
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change id only' }),
      );
      await waitFor(() => expect(readFileSync(baseFile(), 'utf8')).toContain('id: color.primary'), {
        timeout: 5000,
      });
      expect(readFileSync(baseFile(), 'utf8')).toContain('to: color.action');
    });

    it('keeps the item address in a pointer that names an item inside the entry', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Shared accessibility' }));
      await screen.findByRole('region', { name: 'Used by' }, { timeout: 5000 });
      await rename(user, '/shared/0/id', 'shared-rules');
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Change id and update 1 pointer',
        }),
      );
      await waitFor(() => expect(readFileSync(baseFile(), 'utf8')).toContain('id: shared-rules'), {
        timeout: 5000,
      });
      expect(readFileSync(baseFile(), 'utf8')).toContain('to: shared-rules#touch-target');
    });

    it('does not ask when nothing points at the entry', async () => {
      const user = userEvent.setup();
      await openRefsProject(user);
      await user.click(await screen.findByRole('button', { name: 'Dialog' }));
      await waitFor(() =>
        expect(document.querySelector('.toolbar-heading')?.textContent).toBe('Dialog'),
      );
      await rename(user, '/entries/2/id', 'dialog-box');
      await waitFor(() => expect(readFileSync(baseFile(), 'utf8')).toContain('id: dialog-box'), {
        timeout: 5000,
      });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('collapses and restores the code panel from the toolbar, remembering the choice', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    await openNewProject(user);
    const shell = () => document.querySelector('.project-shell') as HTMLElement;
    const hide = screen.getByRole('button', { name: 'Hide code panel' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    // Open: the button is in the code panel's toolbar, at the window's right edge.
    expect(hide.closest('.column--right')).toBeTruthy();
    await user.click(hide);
    expect(shell().classList.contains('project-shell--no-panel')).toBe(true);
    expect(localStorage.getItem('dsds-studio.panel-open')).toBe('false');
    // Collapsed: the same control is now in the form's toolbar, which has become the right edge, and
    // it keeps the keyboard focus the click gave it.
    const show = screen.getByRole('button', { name: 'Show code panel' });
    expect(show.closest('.column--right')).toBeNull();
    expect(show.closest('main')).toBeTruthy();
    expect(document.activeElement).toBe(show);
    // The editor stays mounted, so its text is still there when the panel comes back.
    expect(yamlText()).toContain('schemaVersion');
    await user.click(screen.getByRole('button', { name: 'Show code panel' }));
    expect(shell().classList.contains('project-shell--no-panel')).toBe(false);
    localStorage.clear();
  });

  it('adds an entry from a group title, with the kind implied, and opens it', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await addEntry(user, 'component', 'Button');
    await screen.findByRole('button', { name: 'More actions for Button' }, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Add component entry' }));
    // Same name again: the id gets a suffix instead of colliding.
    await user.type(screen.getByLabelText('New component name'), 'Button{Enter}');
    await waitFor(() => expect(screen.getAllByDisplayValue('button-2').length).toBeGreaterThan(0), {
      timeout: 5000,
    });
    expect(screen.queryByLabelText('New component name')).toBeNull();
    expect(yamlText()).toContain('kind: component');
  });

  it('cancels an add with Escape', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await user.click(await screen.findByRole('button', { name: 'Add system entry' }));
    await user.type(screen.getByLabelText('New system name'), 'Nope');
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('New system name')).toBeNull();
  });

  it('removes an entry from a document after confirming', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await addEntry(user, 'component', 'Button');
    await menuAction(user, 'Button', 'Remove');
    expect(screen.getByText(/Removes this entry from the document/)).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Confirm remove' }));
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'More actions for Button' })).toBeNull(),
      {
        timeout: 5000,
      },
    );
  });

  it('cancelling a removal keeps the entry', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await menuAction(user, 'Demo System', 'Remove');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'More actions for Demo System' })).toBeTruthy();
    // Reopening starts unarmed again.
    await user.click(screen.getByRole('button', { name: 'More actions for Demo System' }));
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toBeTruthy();
  });

  it('duplicates an entry next to the original and opens the copy', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await menuAction(user, 'Demo System', 'Duplicate');
    await screen.findByRole('button', { name: 'More actions for Demo System (copy)' });
    expect(screen.getAllByDisplayValue('Demo System (copy)').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('demo-system-copy').length).toBeGreaterThan(0);
  });

  it('duplicates a standalone entry into a new file without copying its uuid', async () => {
    const user = userEvent.setup();
    const dir = join(ws.root, 'demo-system');
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    await openNewProject(user);
    writeFileSync(
      join(dir, 'extra.dsds.yaml'),
      `kind: entry\nid: extra\nuuid: ${uuid}\nname: Extra Thing\ndescription: x\n`,
    );
    await user.click(screen.getByRole('button', { name: 'Back to projects' }));
    await user.click(await screen.findByRole('button', { name: /demo-system/ }));
    await menuAction(user, 'Extra Thing', 'Duplicate');
    await screen.findByRole('button', { name: 'More actions for Extra Thing (copy)' });
    const copy = join(dir, 'extra-copy.dsds.yaml');
    expect(existsSync(copy)).toBe(true);
    // A uuid is a stable key for one entry: the copy must not share it.
    expect(readFileSync(copy, 'utf8')).not.toContain('uuid');
    expect(readFileSync(join(dir, 'extra.dsds.yaml'), 'utf8')).toContain(uuid);
  });

  it('duplicates an inline entry without copying its uuid', async () => {
    const user = userEvent.setup();
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    await openNewProject(user);
    const base = join(ws.root, 'demo-system', 'demo-system.dsds.yaml');
    writeFileSync(
      base,
      readFileSync(base, 'utf8').replace(
        '    id: demo-system\n',
        `    id: demo-system\n    uuid: ${uuid}\n`,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Back to projects' }));
    await user.click(await screen.findByRole('button', { name: /demo-system/ }));
    await menuAction(user, 'Demo System', 'Duplicate');
    await screen.findByRole('button', { name: 'More actions for Demo System (copy)' });
    const text = readFileSync(base, 'utf8');
    expect(text.split(uuid)).toHaveLength(2); // the original keeps it, the copy has none
  });

  it('duplicates a standalone token whose id has slashes into one flat file', async () => {
    const user = userEvent.setup();
    const dir = join(ws.root, 'demo-system');
    await openNewProject(user);
    writeFileSync(
      join(dir, 'token.dsds.yaml'),
      'kind: token\nid: color/action/primary\nname: Primary\ndescription: x\ntokenType: color\n',
    );
    await user.click(screen.getByRole('button', { name: 'Back to projects' }));
    await user.click(await screen.findByRole('button', { name: /demo-system/ }));
    await menuAction(user, 'Primary', 'Duplicate');
    await screen.findByRole('button', { name: 'More actions for Primary (copy)' });
    const copy = join(dir, 'color-action-primary-copy.dsds.yaml');
    expect(existsSync(copy)).toBe(true);
    expect(readFileSync(copy, 'utf8')).toContain('id: color/action/primary-copy');
    expect(existsSync(join(dir, 'color'))).toBe(false);
  });

  it('removing a standalone entry moves its file to the trash', async () => {
    const user = userEvent.setup();
    const dir = join(ws.root, 'demo-system');
    render(<App />);
    await user.type(await screen.findByLabelText('Design system name'), 'Demo System');
    // Add a standalone entry file before opening the project.
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(
      () => expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
      {
        timeout: 5000,
      },
    );
    writeFileSync(
      join(dir, 'extra.dsds.yaml'),
      'kind: entry\nid: extra\nname: Extra Thing\ndescription: x\n',
    );
    // Re-open so the project list picks up the new file.
    await user.click(screen.getByRole('button', { name: 'Back to projects' }));
    await user.click(await screen.findByRole('button', { name: /demo-system/ }));
    await menuAction(user, 'Extra Thing', 'Remove');
    expect(screen.getByText(/Moves extra\.dsds\.yaml to \.dsds-trash/)).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Confirm remove' }));
    await waitFor(() => expect(existsSync(join(dir, 'extra.dsds.yaml'))).toBe(false), {
      timeout: 5000,
    });
    expect(existsSync(join(dir, '.dsds-trash'))).toBe(true);
  });
});

describe('opening a folder from elsewhere on disk', () => {
  /** A design system repo with tokens deep inside and no documentation yet. */
  const makeRepo = () => {
    const repo = mkdtempSync(join(tmpdir(), 'dsds-repo-'));
    mkdirSync(join(repo, 'src/themes'), { recursive: true });
    writeFileSync(join(repo, 'src/themes/$themes.json'), '[]');
    return repo;
  };

  it('picks a folder, suggests where the tokens are, and opens it as a project', async () => {
    const repo = makeRepo();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Open a folder…' }));
    const path = await screen.findByLabelText('Folder path');
    await user.clear(path);
    await user.type(path, repo);
    await user.click(screen.getByRole('button', { name: 'Go' }));
    // The listing now shows the repo's subfolders.
    expect(await screen.findByRole('button', { name: 'src' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Choose this folder' }));

    // Setup: the token folder is suggested, the documentation folder defaults to documentation.
    expect(await screen.findByDisplayValue('src/themes')).toBeTruthy();
    expect(screen.getByDisplayValue('documentation')).toBeTruthy();
    // The name is not taken from the folder: the button waits for one.
    expect(
      (screen.getByRole('button', { name: 'Open folder' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.type(screen.getByLabelText('Name of the design system'), 'Demo System');
    await user.click(screen.getByRole('button', { name: 'Open folder' }));

    // The project opens, with its starter document written into the documentation folder.
    await waitFor(
      () => expect(screen.getAllByDisplayValue('Demo System').length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
    expect(lstatSync(join(repo, 'documentation/tokens')).isSymbolicLink()).toBe(true);
    expect(await screen.findByText('No unsaved changes', {}, { timeout: 5000 })).toBeTruthy();
  });

  it('lists a linked folder with its path, and stops listing it on request', async () => {
    const repo = makeRepo();
    const res = await createApi(ws).request('/api/projects/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: repo, documentationDir: 'documentation', name: 'Linked DS' }),
    });
    expect(res.status).toBe(201);
    const user = userEvent.setup();
    render(<App />);
    expect(
      await screen.findByText(new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Stop listing linked-ds' }));
    await user.click(screen.getByRole('button', { name: 'Stop listing' }));
    await waitFor(() => expect(screen.queryByText(/documentation in documentation/)).toBeNull());
    // The folder and its documents are untouched.
    expect(existsSync(join(repo, 'documentation/linked-ds.dsds.yaml'))).toBe(true);
  });
});
