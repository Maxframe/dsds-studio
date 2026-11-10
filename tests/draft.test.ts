import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi } from '@server/api';
import { Workspace } from '@server/workspace';

let ws: Workspace;
let api: ReturnType<typeof createApi>;
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const file = 'acme-design.dsds.yaml';
const dir = () => join(ws.root, 'acme-design');
const draft = async () => (await api.request('/api/projects/acme-design/draft')).json();
const discard = () => api.request('/api/projects/acme-design/draft/discard', { method: 'POST' });
const rename = (value: string) =>
  api.request(
    `/api/projects/acme-design/file/ops?path=${file}`,
    json({ ops: [{ op: 'set', pointer: '/entries/0/name', value }] }),
  );
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir(), encoding: 'utf8' });

beforeEach(async () => {
  ws = new Workspace(mkdtempSync(join(tmpdir(), 'dsds-draft-')));
  api = createApi(ws);
  await api.request('/api/projects', json({ name: 'Acme Design' }));
});

describe('draft', () => {
  it('a new project starts with a first version and no draft', async () => {
    expect(await draft()).toEqual({ hasVersion: true, changed: [], suggestedTag: null });
    expect(git('log', '--format=%s').trim()).toBe('Initial version');
  });

  it('the draft is whatever differs from the last version', async () => {
    await rename('Renamed');
    expect(await draft()).toEqual({
      hasVersion: true,
      changed: [{ path: file, status: 'modified' }],
      suggestedTag: null,
    });
  });

  it('lists new and deleted files, but not the trash folder', async () => {
    writeFileSync(join(dir(), 'extra.dsds.yaml'), 'kind: entry\nid: x\nname: X\ndescription: x\n');
    mkdirSync(join(dir(), '.dsds-trash'));
    writeFileSync(join(dir(), '.dsds-trash', 'old.yaml'), 'a: 1\n');
    const { changed } = await draft();
    expect(changed).toEqual([{ path: 'extra.dsds.yaml', status: 'added' }]);
  });

  it('discard returns the files to the last version and keeps them recoverable', async () => {
    await rename('Renamed');
    writeFileSync(join(dir(), 'extra.dsds.yaml'), 'kind: entry\nid: x\nname: X\ndescription: x\n');
    const res = await discard();
    expect(res.status).toBe(200);
    expect(readFileSync(join(dir(), file), 'utf8')).not.toContain('Renamed');
    expect(existsSync(join(dir(), 'extra.dsds.yaml'))).toBe(false);
    expect(await draft()).toEqual({ hasVersion: true, changed: [], suggestedTag: null });
    // Nothing is lost: the discarded changes sit in a git stash.
    expect(git('stash', 'list')).toContain('Discarded draft');
    expect(git('stash', 'show', '-p', '--include-untracked', 'stash@{0}')).toContain('Renamed');
  });

  it('discard with nothing to discard is a no-op', async () => {
    expect((await discard()).status).toBe(200);
    expect(git('stash', 'list')).toBe('');
  });

  it('a project with no version yet reports it and cannot discard', async () => {
    execFileSync('git', ['update-ref', '-d', 'HEAD'], { cwd: dir() });
    const state = await draft();
    expect(state.hasVersion).toBe(false);
    expect(state.changed.length).toBeGreaterThan(0);
    expect((await discard()).status).toBe(409);
  });

  it('404s for an unknown project', async () => {
    expect((await api.request('/api/projects/nope/draft')).status).toBe(404);
  });
});

const save = (body: unknown = {}) => api.request('/api/projects/acme-design/versions', json(body));
const log = () => git('log', '--format=%s|%(trailers:key=DSDS-Kind,valueonly,separator=)').trim();

describe('saving a version', () => {
  it('a quicksave commits the whole draft with a timestamp label', async () => {
    await rename('Renamed');
    writeFileSync(join(dir(), 'extra.dsds.yaml'), 'kind: entry\nid: x\nname: X\ndescription: x\n');
    const res = await save();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changed).toEqual([]);
    const [latest] = log().split('\n');
    expect(latest).toMatch(/^Quicksave \d{4}-\d{2}-\d{2} \d{2}:\d{2}\|quicksave$/);
    expect(git('show', '--name-only', '--format=', 'HEAD')).toContain('extra.dsds.yaml');
  });

  it('a named version has the given label, and an optional tag', async () => {
    await rename('Renamed');
    const res = await save({ label: 'First release', tag: '1.0.0' });
    expect(res.status).toBe(200);
    expect(log().split('\n')[0]).toBe('First release|named');
    expect(git('tag', '--points-at', 'HEAD').trim()).toBe('1.0.0');
  });

  it('refuses when there is nothing to save', async () => {
    expect((await save()).status).toBe(409);
  });

  it('refuses a bad or taken tag and saves nothing', async () => {
    await rename('Renamed');
    expect((await save({ label: 'x', tag: 'not a tag' })).status).toBe(400);
    expect((await save({ label: 'x', tag: '-v' })).status).toBe(400);
    expect((await save({ label: 'v1', tag: 'v1' })).status).toBe(200);
    await rename('Renamed again');
    expect((await save({ label: 'v1 again', tag: 'v1' })).status).toBe(400);
    expect((await draft()).changed).toHaveLength(1);
    expect(log().split('\n')).toHaveLength(2);
  });

  it('a tag needs a named version', async () => {
    await rename('Renamed');
    expect((await save({ tag: 'v1' })).status).toBe(400);
  });

  it('gives a project without any version its first one', async () => {
    execFileSync('git', ['update-ref', '-d', 'HEAD'], { cwd: dir() });
    expect((await save({ label: 'Start' })).status).toBe(200);
    expect(await draft()).toMatchObject({ hasVersion: true, changed: [] });
  });

  it('suggests the system version as a tag until it is taken', async () => {
    await api.request(
      `/api/projects/acme-design/file/ops?path=${file}`,
      json({ ops: [{ op: 'set', pointer: '/entries/0/metadata', value: { version: '1.4.0' } }] }),
    );
    expect((await draft()).suggestedTag).toBe('1.4.0');
    await save({ label: 'Release', tag: '1.4.0' });
    await rename('Later');
    expect((await draft()).suggestedTag).toBeNull();
  });
});

const versions = async () => (await api.request('/api/projects/acme-design/versions')).json();
const post = (path: string, body: unknown) =>
  api.request(`/api/projects/acme-design/versions/${path}`, json(body));

describe('history', () => {
  it('lists versions newest first with kind, label and tags', async () => {
    await rename('One');
    await save();
    await rename('Two');
    await save({ label: 'Second', tag: 'v2' });
    const list = await versions();
    expect(list.map((v: { label: string }) => v.label)).toEqual([
      'Second',
      expect.stringMatching(/^Quicksave /),
      'Initial version',
    ]);
    expect(list.map((v: { kind: string }) => v.kind)).toEqual(['named', 'quicksave', 'named']);
    expect(list[0].tags).toEqual(['v2']);
    expect(list[1].tags).toEqual([]);
    expect(list[0].id).toMatch(/^[0-9a-f]{40}$/);
    expect(new Date(list[0].date).getTime()).not.toBeNaN();
  });

  it('is empty for a project with no version yet', async () => {
    execFileSync('git', ['update-ref', '-d', 'HEAD'], { cwd: dir() });
    expect(await versions()).toEqual([]);
  });

  it('tags an earlier version later', async () => {
    await rename('One');
    await save();
    const [quick] = await versions();
    expect((await post(`${quick.id}/tag`, { tag: 'v0.1' })).status).toBe(200);
    expect((await versions())[0].tags).toEqual(['v0.1']);
    // The same rules as a tag made when saving.
    expect((await post(`${quick.id}/tag`, { tag: 'v0.1' })).status).toBe(400);
    expect((await post(`${quick.id}/tag`, { tag: 'bad name' })).status).toBe(400);
    expect((await post(`${quick.id}/tag`, { tag: '' })).status).toBe(400);
  });

  it('names a quicksave later, without rewriting history', async () => {
    await rename('One');
    await save();
    const [quick] = await versions();
    const before = git('rev-parse', 'HEAD').trim();
    expect((await post(`${quick.id}/name`, { label: 'Hero section' })).status).toBe(200);
    const [named] = await versions();
    expect(named).toMatchObject({ id: quick.id, label: 'Hero section', kind: 'named' });
    expect(git('rev-parse', 'HEAD').trim()).toBe(before);
    expect((await post(`${quick.id}/name`, { label: '  ' })).status).toBe(400);
  });

  it('rejects an id that is not a version of this project', async () => {
    expect((await post('not-a-commit/tag', { tag: 'x' })).status).toBe(404);
    expect((await post(`${'0'.repeat(40)}/tag`, { tag: 'x' })).status).toBe(404);
  });
});

describe('diff endpoint', () => {
  const diff = (query: string) => api.request(`/api/projects/acme-design/diff?${query}`);

  it('compares the latest version with the draft, and two versions with each other', async () => {
    const [{ id: first }] = await versions();
    await rename('Renamed');
    const draftDiff = await (await diff('from=HEAD')).json();
    expect(draftDiff.entries).toHaveLength(1);
    expect(draftDiff.entries[0]).toMatchObject({ status: 'changed', name: 'Renamed' });
    await save({ label: 'Second' });
    const [{ id: second }] = await versions();
    expect((await (await diff(`from=${first}&to=${second}`)).json()).entries).toHaveLength(1);
    expect((await (await diff('from=HEAD')).json()).entries).toEqual([]);
  });

  it('refuses a revision that is not a version of the project', async () => {
    expect((await diff('from=nope')).status).toBe(404);
    expect((await diff('')).status).toBe(404);
    expect((await diff(`from=HEAD&to=${'0'.repeat(40)}`)).status).toBe(404);
    expect((await api.request('/api/projects/nope/diff?from=HEAD')).status).toBe(404);
  });
});

describe('restoring a version', () => {
  const restore = (id: string) => post(`${id}/restore`, {});
  const text = () => readFileSync(join(dir(), file), 'utf8');

  it('makes the files match the version and saves that as a new version', async () => {
    const [{ id: first }] = await versions();
    const original = text();
    await rename('Changed');
    await save({ label: 'Second' });
    const res = await restore(first);
    expect(res.status).toBe(200);
    expect(text()).toBe(original);
    expect(await draft()).toMatchObject({ changed: [] });
    // History is kept: the restore is one more version on top.
    const list = await versions();
    expect(list.map((v: { label: string }) => v.label)).toEqual([
      'Restored “Initial version”',
      'Second',
      'Initial version',
    ]);
    expect(list[0].kind).toBe('named');
    expect(git('log', '-1', '--format=%(trailers:key=DSDS-Restored-From,valueonly)').trim()).toBe(
      first,
    );
  });

  it('removes files the version did not have, and brings back ones it did', async () => {
    const [{ id: first }] = await versions();
    writeFileSync(join(dir(), 'extra.dsds.yaml'), 'kind: entry\nid: x\nname: X\ndescription: x\n');
    await save({ label: 'With extra' });
    const [{ id: second }] = await versions();
    await restore(first);
    expect(existsSync(join(dir(), 'extra.dsds.yaml'))).toBe(false);
    await restore(second);
    expect(existsSync(join(dir(), 'extra.dsds.yaml'))).toBe(true);
  });

  it('refuses while there are unsaved changes, and changes nothing', async () => {
    const [{ id: first }] = await versions();
    await rename('Changed');
    await save({ label: 'Second' });
    await rename('Unsaved');
    const res = await restore(first);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/unsaved changes/i);
    expect(text()).toContain('Unsaved');
    expect(await versions()).toHaveLength(2);
  });

  it('refuses to restore the latest version, which is already what the files are', async () => {
    const [{ id }] = await versions();
    expect((await restore(id)).status).toBe(409);
    expect(await versions()).toHaveLength(1);
  });

  it('refuses an id that is not a version of the project', async () => {
    expect((await restore('nope')).status).toBe(404);
  });
});

describe('stamping changed entries when saving a named version', () => {
  const today = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const value = async (path = file) =>
    (await (await api.request(`/api/projects/acme-design/file?path=${path}`)).json()).value;
  const addEntry = (id: string) =>
    api.request(
      `/api/projects/acme-design/file/ops?path=${file}`,
      json({
        ops: [
          {
            op: 'append',
            pointer: '/entries',
            value: { kind: 'token', id, name: id, description: 'A token.' },
          },
        ],
      }),
    );

  it('sets metadata.updated to today, with the label as the note, on entries that changed', async () => {
    await addEntry('color-red');
    await save({ label: 'Baseline' });
    await rename('Renamed');
    await addEntry('color-blue');
    const res = await save({ label: 'Second release', stamp: true });
    expect(res.status).toBe(200);
    const { entries } = await value();
    // The changed system entry and the new token are stamped; the untouched token is not.
    expect(entries[0].metadata.updated).toEqual({ date: today(), note: 'Second release' });
    expect(entries[2].metadata.updated).toEqual({ date: today(), note: 'Second release' });
    expect(entries[1].metadata).toBeUndefined();
    // It is part of the saved version, and the project still validates.
    expect(await draft()).toMatchObject({ changed: [] });
    const overview = await (await api.request('/api/projects/acme-design')).json();
    expect(overview.validation[file].errors).toBe(0);
  });

  it('does not stamp a quicksave, or a save that did not ask', async () => {
    await rename('One');
    await save();
    await rename('Two');
    await save({ label: 'Named', stamp: false });
    expect((await value()).entries[0].metadata).toBeUndefined();
  });

  it('stamps a standalone entry file, and keeps what else its metadata holds', async () => {
    writeFileSync(
      join(dir(), 'extra.dsds.yaml'),
      'kind: entry\nid: x\nname: X\ndescription: x\nmetadata:\n  tags: [one]\n',
    );
    await save({ label: 'With extra', stamp: true });
    const extra = await value('extra.dsds.yaml');
    expect(extra.metadata).toEqual({
      tags: ['one'],
      updated: { date: today(), note: 'With extra' },
    });
  });

  it('replaces an earlier stamp, but does not stamp an entry only its stamp differs on', async () => {
    await rename('One');
    await save({ label: 'First', stamp: true });
    const stamped = readFileSync(join(dir(), file), 'utf8');
    // Same content, only an older date: nothing else changed, so nothing to stamp again.
    writeFileSync(join(dir(), file), stamped.replace(today(), '2020-01-01'));
    await save({ label: 'Second', stamp: true });
    expect(readFileSync(join(dir(), file), 'utf8')).toContain('2020-01-01');
    await rename('Three');
    await save({ label: 'Third', stamp: true });
    expect((await value()).entries[0].metadata.updated).toEqual({ date: today(), note: 'Third' });
  });

  it('does not stamp the first version of a project', async () => {
    execFileSync('git', ['update-ref', '-d', 'HEAD'], { cwd: dir() });
    await save({ label: 'Start', stamp: true });
    expect((await value()).entries[0].metadata).toBeUndefined();
  });
});
