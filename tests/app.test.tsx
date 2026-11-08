// @vitest-environment jsdom
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi } from '@server/api';
import { Workspace } from '@server/workspace';
import { App } from '../src/web/App';
import './dom-polyfills';
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
    expect(screen.getByLabelText('Entry kind')).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });

  it('lists the base document under "Files" with a base badge', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    expect(screen.getByRole('heading', { name: 'Files' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull();
    const row = screen.getByText('demo-system.dsds.yaml').closest('button') as HTMLElement;
    expect(row.textContent).toContain('base');
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
    await choose(user, await screen.findByLabelText('Entry kind'), 'component');
    await user.type(screen.getByLabelText('Entry name'), 'Button');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('button', { name: 'More actions for Button' }, { timeout: 5000 });
    const group = screen.getByRole('button', { name: 'component' });
    expect(group.getAttribute('aria-expanded')).toBe('true');
    await user.click(group);
    expect(screen.queryByRole('button', { name: 'More actions for Button' })).toBeNull();
    await user.click(group);
    expect(screen.getByRole('button', { name: 'More actions for Button' })).toBeTruthy();
  });

  it('settings change the colour scheme, theme and radius and are remembered', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    await openNewProject(user);
    const root = document.documentElement;
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('radio', { name: 'Color scheme: dark' }));
    await user.click(screen.getByRole('radio', { name: 'Corner radius: large' }));
    await choose(user, screen.getByRole('combobox', { name: 'Theme' }), 'Stone');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-radius')).toBe('large');
    expect(root.getAttribute('data-base')).toBe('stone');
    expect(JSON.parse(localStorage.getItem('dsds-studio.settings') ?? '{}')).toEqual({
      scheme: 'dark',
      base: 'stone',
      radius: 'large',
    });
    await user.click(screen.getByRole('radio', { name: 'Color scheme: system' }));
    expect(root.hasAttribute('data-theme')).toBe(false);
    localStorage.clear();
    for (const a of ['data-theme', 'data-base', 'data-radius']) root.removeAttribute(a);
  });

  it('removes an entry from a document after confirming', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await choose(user, await screen.findByLabelText('Entry kind'), 'component');
    await user.type(screen.getByLabelText('Entry name'), 'Button');
    await user.click(screen.getByRole('button', { name: 'Add' }));
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

  it('duplicates a standalone entry into a new file', async () => {
    const user = userEvent.setup();
    const dir = join(ws.root, 'demo-system');
    await openNewProject(user);
    writeFileSync(
      join(dir, 'extra.dsds.yaml'),
      'kind: entry\nid: extra\nname: Extra Thing\ndescription: x\n',
    );
    await user.click(screen.getByRole('button', { name: 'Back to projects' }));
    await user.click(await screen.findByRole('button', { name: /demo-system/ }));
    await menuAction(user, 'Extra Thing', 'Duplicate');
    await screen.findByRole('button', { name: 'More actions for Extra Thing (copy)' });
    expect(existsSync(join(dir, 'extra-copy.dsds.yaml'))).toBe(true);
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
