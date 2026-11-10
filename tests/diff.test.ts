import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { diffRevisions } from '@server/projects/diff';
import { commitInitialVersion } from '@server/projects/versions';

let dir: string;
const file = 'ds.dsds.yaml';
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
const write = (name: string, text: string) => writeFileSync(join(dir, name), text);
const read = (name: string) => readFileSync(join(dir, name), 'utf8');
const commit = (message: string) => {
  git('add', '-A');
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message],
    { cwd: dir },
  );
  return git('rev-parse', 'HEAD');
};

const BASE = `schemaVersion: "0.23.1"
name: Demo
entries:
  - kind: system
    id: demo
    name: Demo
    description: A system.
  - kind: component
    id: button
    uuid: 550e8400-e29b-41d4-a716-446655440000
    name: Button
    description: A button.
    metadata:
      status: { status: stable }
`;

let first: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsds-diff-'));
  git('init', '-q');
  write(file, BASE);
  commitInitialVersion(dir);
  first = git('rev-parse', 'HEAD');
});

const entry = (r: ReturnType<typeof diffRevisions>, id: string) =>
  r.entries.find((e) => e.id === id);

describe('diffRevisions', () => {
  it('reports nothing when nothing changed', () => {
    expect(diffRevisions(dir, first, 'working').entries).toEqual([]);
  });

  it('reports a changed field with its path, before and after', () => {
    write(file, read(file).replace('name: Button', 'name: Push button'));
    const e = entry(diffRevisions(dir, first, 'working'), 'button');
    expect(e).toMatchObject({ status: 'changed', name: 'Push button', kind: 'component' });
    expect(e?.fields).toEqual([
      { path: '/name', change: 'changed', before: 'Button', after: 'Push button' },
    ]);
  });

  it('ignores key order and formatting: only content counts', () => {
    write(
      file,
      read(file).replace(
        '    id: button\n    uuid: 550e8400-e29b-41d4-a716-446655440000\n    name: Button',
        '    name: "Button"\n    uuid: 550e8400-e29b-41d4-a716-446655440000\n    id: button',
      ),
    );
    expect(diffRevisions(dir, first, 'working').entries).toEqual([]);
  });

  it('reports added and removed entries, and warns when an id is removed', () => {
    write(
      file,
      read(file).replace(
        / {2}- kind: component[\s\S]*$/,
        '  - kind: token\n    id: color-red\n    name: Red\n    description: Red.\n',
      ),
    );
    const r = diffRevisions(dir, first, 'working');
    expect(entry(r, 'color-red')).toMatchObject({ status: 'added' });
    const removed = entry(r, 'button');
    expect(removed).toMatchObject({ status: 'removed' });
    expect(removed?.warning).toMatch(/id/i);
    expect(entry(r, 'color-red')?.warning).toBeUndefined();
  });

  it('follows an entry by uuid and warns when its id changed', () => {
    write(file, read(file).replace('id: button', 'id: push-button'));
    const r = diffRevisions(dir, first, 'working');
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      id: 'push-button',
      status: 'changed',
      idChanged: { from: 'button', to: 'push-button' },
    });
    expect(r.entries[0]?.warning).toMatch(/deprecated stub|replacedBy/);
  });

  it('flags an entry that became deprecated', () => {
    write(
      file,
      read(file).replace(
        'status: { status: stable }',
        'status: { status: deprecated, deprecationNotice: Use link }',
      ),
    );
    expect(entry(diffRevisions(dir, first, 'working'), 'button')?.deprecated).toBe(true);
  });

  it('describes nested and list changes by path', () => {
    write(
      file,
      read(file).replace(
        '    description: A button.\n',
        '    description: A button.\n    sections:\n      - kind: guidelines\n        for: all\n        items: []\n',
      ),
    );
    const e = entry(diffRevisions(dir, first, 'working'), 'button');
    expect(e?.fields.map((f) => [f.path, f.change])).toEqual([['/sections', 'added']]);
  });

  it('compares two versions, and includes standalone entry files', () => {
    write(file, read(file).replace('name: Button', 'name: Renamed'));
    write('extra.dsds.yaml', 'kind: entry\nid: extra\nname: Extra\ndescription: x\n');
    const second = commit('second');
    const r = diffRevisions(dir, first, second);
    expect(entry(r, 'button')).toMatchObject({ status: 'changed' });
    expect(entry(r, 'extra')).toMatchObject({ status: 'added', file: 'extra.dsds.yaml' });
    expect(diffRevisions(dir, second, 'working').entries).toEqual([]);
  });

  it('reports changes to the base document itself', () => {
    write(file, read(file).replace('name: Demo\nentries', 'name: Demo 2\nentries'));
    const base = diffRevisions(dir, first, 'working').entries.find((e) => e.key === '@base');
    expect(base?.fields).toEqual([
      { path: '/name', change: 'changed', before: 'Demo', after: 'Demo 2' },
    ]);
  });

  it('shortens very long values', () => {
    write(file, read(file).replace('A button.', `A ${'long '.repeat(100)}button.`));
    const f = entry(diffRevisions(dir, first, 'working'), 'button')?.fields[0];
    expect((f?.after ?? '').length).toBeLessThanOrEqual(201);
    expect(f?.after).toMatch(/…$/);
  });
});
