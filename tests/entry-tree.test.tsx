// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EntryTree, type Selection } from '../src/web/EntryTree';
import type { EntrySummary, ProjectOverview } from '@shared/types';
import './dom-polyfills';
import { iconButtonsMissingHints } from './icon-buttons';

afterEach(cleanup);

const entry = (id: string, i: number): EntrySummary => ({
  id,
  kind: 'token',
  name: `Name of ${id}`,
  file: 'tokens.dsds.yaml',
  pointer: `/entries/${i}`,
  origin: 'entries',
});

const ids = [
  'ob.s.color.status.info.bg',
  'ob.s.color.status.info.fg',
  'ob.s.color.status.critical.bg',
  'ob.s.color.neutral.bg',
  'ob.s.color.neutral.fg',
  'lonely',
];

const overview = (findings: ProjectOverview['validation'] = {}): ProjectOverview => ({
  slug: 'demo',
  title: 'Demo',
  schemaVersion: '0.23.1',
  pack: null,
  documents: [{ path: 'tokens.dsds.yaml', format: 'yaml' }],
  entries: ids.map(entry),
  problems: [],
  validation: findings,
});

function Tree(props: { overview?: ProjectOverview; start?: Selection | null }) {
  const [selection, setSelection] = useState<Selection | null>(props.start ?? null);
  return (
    <EntryTree
      overview={props.overview ?? overview()}
      selection={selection}
      onSelect={setSelection}
      bundle={null}
      entryItems={null}
      sharedItems={null}
      namespace="demo"
      apply={async () => {}}
      onRemove={() => {}}
      onDuplicate={() => {}}
    />
  );
}

const row = (id: string) => screen.queryByRole('button', { name: `Name of ${id}` });

describe('entry tree groups by id', () => {
  it('shows groups collapsed, with a count, and opens one on click', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    const group = screen.getByRole('button', { name: /ob\.s\.color/ });
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(group.textContent).toContain('5');
    expect(row('ob.s.color.neutral.bg')).toBeNull();
    // A lone entry has no group, so it is always listed.
    expect(row('lonely')).toBeTruthy();

    await user.click(group);
    expect(screen.getByRole('button', { name: /^status/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^neutral/ }));
    expect(row('ob.s.color.neutral.bg')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^neutral/ }));
    expect(row('ob.s.color.neutral.bg')).toBeNull();
  });

  it('opens the groups above the selected entry', () => {
    render(
      <Tree
        start={{
          type: 'entry',
          file: 'tokens.dsds.yaml',
          pointer: '/entries/2',
          origin: 'entries',
        }}
      />,
    );
    expect(row('ob.s.color.status.critical.bg')).toBeTruthy();
    expect(row('ob.s.color.neutral.bg')).toBeNull();
  });

  it('sums findings on a collapsed group', () => {
    render(
      <Tree
        overview={overview({
          'tokens.dsds.yaml': {
            ok: false,
            findings: [
              { severity: 'error', pointer: '/entries/0', message: 'x', rule: 'r' },
              { severity: 'error', pointer: '/entries/3/name', message: 'y', rule: 'r' },
            ],
          } as ProjectOverview['validation'][string],
        })}
      />,
    );
    const group = screen.getByRole('button', { name: /ob\.s\.color/ });
    expect(group.querySelector('.badge--error')?.textContent).toBe('2');
  });
});

describe('entry tree filter', () => {
  it('shows only matches, with their groups open, and restores on clear', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.type(screen.getByRole('textbox', { name: 'Filter entries' }), 'critical');
    expect(row('ob.s.color.status.critical.bg')).toBeTruthy();
    expect(row('ob.s.color.status.info.bg')).toBeNull();
    expect(row('lonely')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(row('ob.s.color.status.critical.bg')).toBeNull();
    expect(row('lonely')).toBeTruthy();
  });

  it('matches several words in any order, and Escape clears', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    const box = screen.getByRole('textbox', { name: 'Filter entries' });
    await user.type(box, 'fg neutral');
    expect(row('ob.s.color.neutral.fg')).toBeTruthy();
    expect(row('ob.s.color.neutral.bg')).toBeNull();
    await user.keyboard('{Escape}');
    expect((box as HTMLInputElement).value).toBe('');
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.type(screen.getByRole('textbox', { name: 'Filter entries' }), 'zzz');
    expect(screen.getByRole('status').textContent).toContain('zzz');
  });

  it('keeps every icon button named and hinted', async () => {
    const user = userEvent.setup();
    render(<Tree />);
    await user.type(screen.getByRole('textbox', { name: 'Filter entries' }), 'a');
    expect(iconButtonsMissingHints()).toEqual([]);
  });
});
