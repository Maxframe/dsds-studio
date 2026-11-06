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

  it('removes an entry from a document after confirming', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await user.selectOptions(await screen.findByLabelText('Entry kind'), 'component');
    await user.type(screen.getByLabelText('Entry name'), 'Button');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const remove = await screen.findByRole('button', { name: 'Remove Button' }, { timeout: 5000 });
    await user.click(remove);
    expect(screen.getByRole('group', { name: /Confirm: Remove Button/ })).toBeTruthy();
    expect(screen.getByText(/Removes this entry from the document/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Remove Button' })).toBeNull(),
      {
        timeout: 5000,
      },
    );
  });

  it('cancelling a removal keeps the entry', async () => {
    const user = userEvent.setup();
    await openNewProject(user);
    await user.click(await screen.findByRole('button', { name: 'Remove Demo System' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Remove Demo System' })).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: '← Projects' }));
    await user.click(await screen.findByRole('button', { name: /demo-system/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Remove Extra Thing' }, { timeout: 5000 }),
    );
    expect(screen.getByText(/Moves extra\.dsds\.yaml to \.dsds-trash/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(existsSync(join(dir, 'extra.dsds.yaml'))).toBe(false), {
      timeout: 5000,
    });
    expect(existsSync(join(dir, '.dsds-trash'))).toBe(true);
  });
});
