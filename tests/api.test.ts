import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

beforeEach(() => {
  ws = new Workspace(mkdtempSync(join(tmpdir(), 'dsds-ws-')));
  api = createApi(ws);
});

async function createProject(name = 'Acme Design') {
  const res = await api.request('/api/projects', json({ name }));
  return { res, body: (await res.json()) as { slug: string } };
}

describe('projects', () => {
  it('creates a project with a valid starter document', async () => {
    const { res, body } = await createProject();
    expect(res.status).toBe(201);
    expect(body.slug).toBe('acme-design');
    const overview = await (await api.request('/api/projects/acme-design')).json();
    expect(overview.pack.version).toBeTruthy();
    expect(overview.entries[0]).toMatchObject({ id: 'acme-design', kind: 'system' });
    expect(overview.validation['acme-design.dsds.yaml'].errors).toBe(0);
    expect(ws.dirOf('acme-design')).toBeTruthy();
  });

  it('lists projects and rejects duplicates and empty names', async () => {
    await createProject();
    expect((await createProject()).res.status).toBe(409);
    expect((await api.request('/api/projects', json({ name: '  ' }))).status).toBe(400);
    expect(await (await api.request('/api/projects')).json()).toEqual([
      { slug: 'acme-design', title: 'Acme Design', documents: 1 },
    ]);
  });

  it('404s for an unknown project', async () => {
    expect((await api.request('/api/projects/nope')).status).toBe(404);
  });
});

describe('creating a project with platforms (Conformance §9)', () => {
  const create = (body: unknown) => api.request('/api/projects', json(body));
  const systemOf = async () =>
    (await (await api.request('/api/projects/acme-design/file?path=acme-design.dsds.yaml')).json())
      .value.entries[0];

  it('declares them on the system entry, as valid ids', async () => {
    const res = await create({ name: 'Acme Design', platforms: ['React Native', 'iOS', 'ios'] });
    expect(res.status).toBe(201);
    expect((await systemOf()).metadata).toEqual({ platforms: ['react-native', 'ios'] });
    const overview = await (await api.request('/api/projects/acme-design')).json();
    expect(overview.validation['acme-design.dsds.yaml'].errors).toBe(0);
  });

  it('adds no metadata when none are given, or none are usable', async () => {
    await create({ name: 'Acme Design', platforms: ['!!!', ''] });
    expect((await systemOf()).metadata).toBeUndefined();
  });

  it('ignores a platforms value that is not a list of text', async () => {
    const res = await create({ name: 'Acme Design', platforms: 'react' });
    expect(res.status).toBe(201);
    expect((await systemOf()).metadata).toBeUndefined();
  });
});

describe('saving a file into a folder that does not exist yet', () => {
  const put = (path: string) =>
    api.request(`/api/projects/acme-design/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'kind: entry\nid: x\nname: X\ndescription: x\n' }),
    });

  it('creates the folders it needs', async () => {
    await createProject();
    const res = await put('entries/color/action.dsds.yaml');
    expect(res.status).toBe(200);
    expect(existsSync(join(ws.root, 'acme-design', 'entries/color/action.dsds.yaml'))).toBe(true);
  });

  it('still refuses a path that leaves the project, and creates nothing for it', async () => {
    await createProject();
    const res = await put('../escape/x.dsds.yaml');
    expect(res.status).toBe(400);
    expect(existsSync(join(ws.root, 'escape'))).toBe(false);
  });
});

describe('files', () => {
  const path = 'acme-design.dsds.yaml';

  it('edits by pointer, keeps comments, and returns fresh validation', async () => {
    await createProject();
    const abs = join(ws.root, 'acme-design', path);
    writeFileSync(abs, '# keep me\n' + readFileSync(abs, 'utf8'));
    const res = await api.request(
      `/api/projects/acme-design/file/ops?path=${path}`,
      json({ ops: [{ op: 'set', pointer: '/entries/0/name', value: 'Renamed' }] }),
    );
    const body = await res.json();
    expect(body.value.entries[0].name).toBe('Renamed');
    expect(body.validation.errors).toBe(0);
    expect(readFileSync(abs, 'utf8')).toContain('# keep me');
  });

  it('reports validation errors after a bad edit', async () => {
    await createProject();
    const res = await api.request(
      `/api/projects/acme-design/file/ops?path=${path}`,
      json({ ops: [{ op: 'remove', pointer: '/entries/0/description' }] }),
    );
    expect((await res.json()).validation.errors).toBeGreaterThan(0);
  });

  it('refuses paths outside the project and non-document files', async () => {
    await createProject();
    for (const p of ['../x.dsds.yaml', '/etc/passwd', 'package.json']) {
      const res = await api.request(`/api/projects/acme-design/file?path=${encodeURIComponent(p)}`);
      expect(res.status).toBe(400);
    }
  });

  it('refuses a raw replace that does not parse', async () => {
    await createProject();
    const res = await api.request(`/api/projects/acme-design/file?path=${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'a: [unclosed' }),
    });
    expect(res.status).toBe(400);
  });

  it('lists ref targets including item addresses', async () => {
    await createProject();
    const targets = await (await api.request('/api/projects/acme-design/targets')).json();
    expect(targets).toContainEqual({ target: 'acme-design', label: 'Acme Design', type: 'entry' });
  });
});

describe('removing a document', () => {
  it('moves a standalone entry file to .dsds-trash and drops it from the project', async () => {
    await createProject();
    const dir = join(ws.root, 'acme-design');
    writeFileSync(
      join(dir, 'extra.dsds.yaml'),
      'kind: entry\nid: extra\nname: Extra\ndescription: x\n',
    );
    const res = await api.request('/api/projects/acme-design/file?path=extra.dsds.yaml', {
      method: 'DELETE',
    });
    const { trashed } = await res.json();
    expect(res.status).toBe(200);
    expect(existsSync(join(dir, trashed))).toBe(true);
    expect(existsSync(join(dir, 'extra.dsds.yaml'))).toBe(false);
    const overview = await (await api.request('/api/projects/acme-design')).json();
    expect(overview.entries.map((e: { id: string }) => e.id)).toEqual(['acme-design']);
  });

  it('refuses to remove the only document, and bad paths', async () => {
    await createProject();
    const del = (p: string) =>
      api.request(`/api/projects/acme-design/file?path=${encodeURIComponent(p)}`, {
        method: 'DELETE',
      });
    expect((await del('acme-design.dsds.yaml')).status).toBe(400);
    expect((await del('../x.dsds.yaml')).status).toBe(404);
    expect((await del('package.json')).status).toBe(404);
  });
});

describe('schema', () => {
  it('serves the bundled schema of an installed pack', async () => {
    const packs = await (await api.request('/api/packs')).json();
    const res = await api.request(`/api/packs/${packs[0].version}/schema`);
    expect((await res.json()).$defs['entries/entry']).toBeDefined();
    expect((await api.request('/api/packs/9.9.9/schema')).status).toBe(404);
  });
});

describe('style guide order on save', () => {
  const ops = (path: string, body: unknown) =>
    api.request(`/api/projects/acme-design/file/ops?path=${path}`, json(body));

  it('puts a field added out of order where the schema declares it, keeping unknown data', async () => {
    await createProject();
    const path = encodeURIComponent('acme-design.dsds.yaml');
    await ops(path, {
      ops: [
        {
          op: 'append',
          pointer: '/entries',
          value: { kind: 'component', id: 'btn', name: 'Button', $extensions: { 'acme.x': 1 } },
        },
      ],
    });
    const res = await ops(path, {
      ops: [{ op: 'set', pointer: '/entries/1/description', value: 'A button.' }],
    });
    const { text } = await res.json();
    const lines = text.split('\n') as string[];
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    expect(at('description: A button.')).toBeGreaterThan(at('name: Button'));
    expect(at('description: A button.')).toBeLessThan(at('$extensions'));
    expect(text).toContain('acme.x: 1');
    // What is on disk is what the client was told.
    const disk = readFileSync(
      join(ws.dirOf('acme-design') as string, 'acme-design.dsds.yaml'),
      'utf8',
    );
    expect(disk).toBe(text);
  });
});
