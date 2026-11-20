import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi } from '@server/api';
import { SnapshotStore } from '@server/projects/snapshots';
import { Workspace } from '@server/workspace';

let ws: Workspace;
let api: ReturnType<typeof createApi>;
let repo: string;

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const link = (body: Record<string, unknown>) =>
  api.request('/api/projects/link', json('POST', { root: repo, name: 'Demo System', ...body }));

/** A design system repo: tokens deep in `src`, no documentation yet. */
beforeEach(() => {
  ws = new Workspace(mkdtempSync(join(tmpdir(), 'dsds-ws-')));
  api = createApi(ws);
  repo = mkdtempSync(join(tmpdir(), 'dsds-repo-'));
  mkdirSync(join(repo, 'src/lib/themes'), { recursive: true });
  mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'src/lib/themes/$themes.json'), '[]');
  writeFileSync(
    join(repo, 'src/lib/themes/color.json'),
    JSON.stringify({ color: { red: { $type: 'color', $value: '#f00' } } }),
  );
  writeFileSync(join(repo, 'docs/readme.md'), '# docs\n');
});

describe('folder picker', () => {
  it('lists the subfolders of a folder, without hidden ones, with a way up', async () => {
    mkdirSync(join(repo, '.hidden'));
    const res = await api.request(`/api/fs/folders?path=${encodeURIComponent(repo)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe(repo);
    expect(body.folders.map((f: { name: string }) => f.name)).toEqual(['docs', 'src']);
    expect(body.parent).toBe(join(repo, '..'));
  });

  it('starts at the home folder and refuses what is not a folder', async () => {
    const start = await (await api.request('/api/fs/folders')).json();
    expect(start.path).toBe(start.home);
    const res = await api.request(
      `/api/fs/folders?path=${encodeURIComponent(join(repo, 'docs/readme.md'))}`,
    );
    expect(res.status).toBe(400);
  });

  it('suggests where tokens and documents seem to be', async () => {
    mkdirSync(join(repo, 'documentation'));
    writeFileSync(
      join(repo, 'documentation/ds.dsds.yaml'),
      'schemaVersion: "0.23.1"\nentries: []\n',
    );
    const res = await api.request(`/api/fs/inspect?path=${encodeURIComponent(repo)}`);
    expect(await res.json()).toMatchObject({
      tokenDirs: ['src/lib/themes'],
      documentationDirs: ['documentation'],
    });
    expect((await api.request('/api/fs/inspect?path=/no/such/folder')).status).toBe(400);
  });
});

describe('opening a folder', () => {
  it('creates the documentation folder with a starter document and links the tokens into it', async () => {
    const res = await link({
      documentationDir: 'documentation',
      tokensDir: 'src/lib/themes',
      linkTokens: true,
    });
    expect(res.status).toBe(201);
    const { project, warnings } = await res.json();
    expect(warnings).toEqual([]);
    expect(project).toMatchObject({
      documents: 1,
      linked: { root: repo, documentationDir: 'documentation', tokensDir: 'src/lib/themes' },
    });
    expect(existsSync(join(repo, 'documentation', `${project.slug}.dsds.yaml`))).toBe(true);
    const tokens = join(repo, 'documentation/tokens');
    expect(lstatSync(tokens).isSymbolicLink()).toBe(true);
    expect(readlinkSync(tokens)).toBe('../src/lib/themes');
    // The folder is a project like any other.
    const list = await (await api.request('/api/projects')).json();
    expect(list.map((p: { slug: string }) => p.slug)).toContain(project.slug);
    const overview = await (await api.request(`/api/projects/${project.slug}`)).json();
    expect(overview.documents).toHaveLength(1);
    expect(overview.validation[`${project.slug}.dsds.yaml`].errors).toBe(0);
  });

  it('starts with a saved version, so the draft is clean', async () => {
    const { project } = await (await link({ documentationDir: 'documentation' })).json();
    const draft = await (await api.request(`/api/projects/${project.slug}/draft`)).json();
    expect(draft).toMatchObject({ hasVersion: true, changed: [] });
  });

  it('leaves the rest of the folder alone and keeps its versions out of it', async () => {
    const { project } = await (
      await link({
        documentationDir: 'documentation',
        tokensDir: 'src/lib/themes',
        linkTokens: true,
      })
    ).json();
    expect(existsSync(join(repo, '.git'))).toBe(false);
    const file = `${project.slug}.dsds.yaml`;
    await api.request(
      `/api/projects/${project.slug}/file/ops?path=${file}`,
      json('POST', { ops: [{ op: 'set', pointer: '/entries/0/name', value: 'Renamed' }] }),
    );
    await api.request(`/api/projects/${project.slug}/versions`, json('POST', {}));
    const version = new SnapshotStore(join(repo, 'documentation')).list()[0];
    // A snapshot covers the documentation folder: the documents, not the linked tokens or the rest of the repo.
    expect(Object.keys(version?.files ?? {})).toEqual([file]);
    expect(readFileSync(join(repo, 'src/lib/themes/color.json'), 'utf8')).toContain('#f00');
    expect(existsSync(join(repo, 'documentation/.git'))).toBe(false);
  });

  it('lets the validator check source paths that go through the link', async () => {
    const { project } = await (
      await link({
        documentationDir: 'documentation',
        tokensDir: 'src/lib/themes',
        linkTokens: true,
      })
    ).json();
    const file = `${project.slug}.dsds.yaml`;
    const add = (id: string, source: string) =>
      api.request(
        `/api/projects/${project.slug}/file/ops?path=${file}`,
        json('POST', {
          ops: [
            {
              op: 'append',
              pointer: '/entries',
              value: { kind: 'token', id, name: id, description: 'A token.', source },
            },
          ],
        }),
      );
    await add('color.red', './tokens/color.json#/color/red');
    await add('color.blue', './tokens/missing.json#/color/blue');
    const overview = await (await api.request(`/api/projects/${project.slug}`)).json();
    const findings = overview.validation[file].findings as { rule: string; message: string }[];
    const missing = findings.filter((f) => f.rule === 'DSDS-11');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain('missing.json');
  });

  it('does not open a project twice, and gives a second one with the same name its own slug', async () => {
    const first = await (await link({ documentationDir: 'documentation' })).json();
    expect((await link({ documentationDir: 'documentation' })).status).toBe(409);
    const other = mkdtempSync(join(tmpdir(), 'dsds-repo-'));
    const second = await (
      await api.request(
        '/api/projects/link',
        json('POST', { root: other, name: first.project.slug }),
      )
    ).json();
    expect(second.project.slug).toBe(`${first.project.slug}-2`);
  });

  it('refuses folders and paths it should not touch', async () => {
    expect((await link({ root: 'relative/path' })).status).toBe(400);
    expect((await link({ root: join(repo, 'nope') })).status).toBe(400);
    expect((await link({ documentationDir: '../outside' })).status).toBe(400);
    expect((await link({ documentationDir: '/etc' })).status).toBe(400);
    expect((await link({ documentationDir: 'documentation', tokensDir: '../x' })).status).toBe(400);
    expect(
      (await link({ documentationDir: 'documentation', tokensDir: 'nothing/here' })).status,
    ).toBe(400);
    expect((await link({ root: ws.root })).status).toBe(400);
    expect(existsSync(join(repo, 'documentation'))).toBe(false);
  });

  it('opens a folder that already has documents without adding a starter document', async () => {
    mkdirSync(join(repo, 'documentation'));
    writeFileSync(
      join(repo, 'documentation/ds.dsds.yaml'),
      'schemaVersion: "0.23.1"\nname: Mine\nentries:\n  - kind: system\n    id: mine\n    name: Mine\n    description: A system.\n',
    );
    const { project } = await (await link({ documentationDir: 'documentation' })).json();
    expect(project.documents).toBe(1);
  });

  it('warns instead of linking when the tokens are already inside, would loop, or the name is taken', async () => {
    const inside = await (
      await link({ documentationDir: 'src', tokensDir: 'src/lib/themes', linkTokens: true })
    ).json();
    expect(inside.warnings[0]).toMatch(/inside the documentation folder already/);
    expect(existsSync(join(repo, 'src/tokens'))).toBe(false);

    const loop = mkdtempSync(join(tmpdir(), 'dsds-repo-'));
    mkdirSync(join(loop, 'tokens/documentation'), { recursive: true });
    const looped = await (
      await api.request(
        '/api/projects/link',
        json('POST', {
          root: loop,
          name: 'Loop',
          documentationDir: 'tokens/documentation',
          tokensDir: 'tokens',
          linkTokens: true,
        }),
      )
    ).json();
    expect(looped.warnings[0]).toMatch(/would loop/);

    const taken = mkdtempSync(join(tmpdir(), 'dsds-repo-'));
    mkdirSync(join(taken, 'documentation/tokens'), { recursive: true });
    mkdirSync(join(taken, 'themes'));
    const res = await (
      await api.request(
        '/api/projects/link',
        json('POST', {
          root: taken,
          name: 'Taken',
          documentationDir: 'documentation',
          tokensDir: 'themes',
          linkTokens: true,
        }),
      )
    ).json();
    expect(res.warnings[0]).toMatch(/exists already/);
    expect(lstatSync(join(taken, 'documentation/tokens')).isSymbolicLink()).toBe(false);
  });

  it('unlinking forgets the folder and leaves its files and versions', async () => {
    const { project } = await (await link({ documentationDir: 'documentation' })).json();
    expect(
      (await api.request(`/api/projects/${project.slug}/link`, { method: 'DELETE' })).status,
    ).toBe(200);
    const list = await (await api.request('/api/projects')).json();
    expect(list.map((p: { slug: string }) => p.slug)).not.toContain(project.slug);
    expect(existsSync(join(repo, 'documentation', `${project.slug}.dsds.yaml`))).toBe(true);
    expect(new SnapshotStore(join(repo, 'documentation')).list()).toHaveLength(1);
    expect(
      (await api.request(`/api/projects/${project.slug}/link`, { method: 'DELETE' })).status,
    ).toBe(404);
  });

  it('still reads a registry entry written before the folder was called documentation', async () => {
    mkdirSync(join(repo, 'documentation'));
    writeFileSync(
      join(repo, 'documentation/ds.dsds.yaml'),
      'schemaVersion: "0.23.1"\nentries: []\n',
    );
    mkdirSync(dirname(ws.links.file), { recursive: true });
    writeFileSync(
      ws.links.file,
      JSON.stringify([
        { slug: 'old', name: 'Old', root: repo, specDir: 'documentation', tokensDir: null },
      ]),
    );
    const list = await (await api.request('/api/projects')).json();
    expect(list.find((p: { slug: string }) => p.slug === 'old')).toMatchObject({
      documents: 1,
      linked: { documentationDir: 'documentation' },
    });
    expect((await api.request('/api/projects/old')).status).toBe(200);
  });

  it('names the project after the design system, never after the folder', async () => {
    const { project } = await (
      await link({ name: 'Oblique', documentationDir: 'documentation' })
    ).json();
    expect(project.slug).toBe('oblique');
    expect(project.title).toBe('Oblique');
    // Renaming the system in its document changes the title; the folder name never matters.
    await api.request(
      `/api/projects/oblique/file/ops?path=oblique.dsds.yaml`,
      json('POST', {
        ops: [{ op: 'set', pointer: '/entries/0/name', value: 'Oblique design system' }],
      }),
    );
    const list = await (await api.request('/api/projects')).json();
    expect(list.find((p: { slug: string }) => p.slug === 'oblique').title).toBe(
      'Oblique design system',
    );
    const overview = await (await api.request('/api/projects/oblique')).json();
    expect(overview.title).toBe('Oblique design system');
  });

  it('asks for a name instead of taking it from the folder', async () => {
    const res = await link({ name: '   ' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name/i);
    expect(existsSync(join(repo, 'documentation'))).toBe(false);
  });

  it('suggests the name of a design system whose documents already exist', async () => {
    mkdirSync(join(repo, 'documentation'));
    writeFileSync(
      join(repo, 'documentation/ds.dsds.yaml'),
      'schemaVersion: "0.23.1"\nname: Mine\nentries:\n  - kind: system\n    id: mine\n    name: Oblique\n    description: A system.\n',
    );
    const found = await (
      await api.request(`/api/fs/inspect?path=${encodeURIComponent(repo)}`)
    ).json();
    expect(found).toMatchObject({ name: 'Oblique', folder: repo.split('/').pop() });
    // Without documents there is nothing to suggest.
    const bare = mkdtempSync(join(tmpdir(), 'dsds-repo-'));
    expect(
      (await (await api.request(`/api/fs/inspect?path=${encodeURIComponent(bare)}`)).json()).name,
    ).toBe('');
  });

  it('does not treat a workspace project as a linked folder', async () => {
    await api.request('/api/projects', json('POST', { name: 'Own' }));
    expect((await api.request('/api/projects/own/link', { method: 'DELETE' })).status).toBe(404);
  });
});

describe('a file changed from outside', () => {
  let slug: string;
  let file: string;
  const url = () => `/api/projects/${slug}/file?path=${file}`;
  const put = (text: string) => api.request(url(), json('PUT', { text }));

  beforeEach(async () => {
    const res = await (await link({ documentationDir: 'documentation' })).json();
    slug = res.project.slug;
    file = `${slug}.dsds.yaml`;
  });

  it('refuses to overwrite a file that changed on disk after it was opened', async () => {
    const opened = (await (await api.request(url())).json()) as { text: string };
    const path = join(repo, 'documentation', file);
    writeFileSync(path, `${opened.text}# edited elsewhere\n`);
    const res = await put(opened.text.replace('Describe', 'Changed'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/changed on disk/);
    expect(readFileSync(path, 'utf8')).toContain('# edited elsewhere');
    // Reading it again shows the current file, and then saving works.
    const reopened = (await (await api.request(url())).json()) as { text: string };
    expect(reopened.text).toContain('# edited elsewhere');
    expect((await put(reopened.text.replace('Describe', 'Changed'))).status).toBe(200);
  });

  it('does not mistake its own edits for outside changes', async () => {
    const opened = (await (await api.request(url())).json()) as { text: string };
    await api.request(
      `/api/projects/${slug}/file/ops?path=${file}`,
      json('POST', { ops: [{ op: 'set', pointer: '/entries/0/name', value: 'Renamed' }] }),
    );
    expect((await put(opened.text.replace('Describe', 'Changed'))).status).toBe(200);
    expect((await put(readFileSync(join(repo, 'documentation', file), 'utf8'))).status).toBe(200);
  });

  it('does not mistake a restore or a discard for an outside change', async () => {
    const opened = (await (await api.request(url())).json()) as { text: string };
    await put(opened.text.replace('Describe', 'Changed'));
    await api.request(`/api/projects/${slug}/draft/discard`, { method: 'POST' });
    const now = readFileSync(join(repo, 'documentation', file), 'utf8');
    expect((await put(`${now}# note\n`)).status).toBe(200);
  });
});
